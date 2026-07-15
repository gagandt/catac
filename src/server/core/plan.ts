// Core planning logic: turn "I have N months, X hours/day" into a dated,
// weighted schedule across the syllabus. One active plan per exam. Adaptive
// re-planning (reweightPlanFromMock) biases time toward weak sections after a
// mock. All logic here so the CLI (Claude) and the UI produce identical plans.

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
	exam,
	mockAttempt,
	plan,
	planItem,
	section,
	topic,
	userPref,
} from "~/server/db/schema";

// --- date helpers (UTC, date-only) --------------------------------------
export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}
function isISODate(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
function daysBetween(a: string, b: string): number {
	return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export class ExamNotFoundError extends Error {
	constructor(id: string) {
		super(`unknown exam id: "${id}"`);
		this.name = "ExamNotFoundError";
	}
}
export class InvalidDateError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = "InvalidDateError";
	}
}
export class PlanItemNotFoundError extends Error {
	constructor(id: number) {
		super(`unknown plan item id: ${id}`);
		this.name = "PlanItemNotFoundError";
	}
}
export class NoActivePlanError extends Error {
	constructor(examId: string) {
		super(`no active plan for "${examId}" — create one first`);
		this.name = "NoActivePlanError";
	}
}
export class NoMockError extends Error {
	constructor(examId: string) {
		super(`no mock logged for "${examId}" — log one before reweighting`);
		this.name = "NoMockError";
	}
}

const DEFAULT_DAILY_HOURS = 3;
// A section scoring 0 on the mock gets ~2x its base (marks) share; a section at
// full marks keeps its base share.
const WEAKNESS_BIAS = 1;
const round1 = (n: number) => Math.round(n * 10) / 10;

async function resolveDailyHours(explicit?: number): Promise<number> {
	if (explicit && explicit > 0) return explicit;
	const pref = await db
		.select()
		.from(userPref)
		.where(eq(userPref.key, "dailyHours"))
		.limit(1);
	const v = pref[0]?.value;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_HOURS;
}

/**
 * Allocate total available hours across topics and lay them out as consecutive
 * dated windows in syllabus order. Section share = marks x (1 + BIAS x weakness);
 * within a section, by topic weight (or equal if unweighted). Shared by create
 * and reweight so the two never drift.
 */
async function buildPlanItems(opts: {
	examId: string;
	planId: number;
	dailyHours: number;
	today: string;
	targetDate: string;
	weakness?: Map<string, number>; // sectionId -> 0..1
}): Promise<(typeof planItem.$inferInsert)[]> {
	const daysAvailable = daysBetween(opts.today, opts.targetDate);
	const totalHours = daysAvailable * opts.dailyHours;

	const sections = await db
		.select()
		.from(section)
		.where(eq(section.examId, opts.examId))
		.orderBy(asc(section.orderIndex));
	const topics = await db
		.select()
		.from(topic)
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, opts.examId))
		.orderBy(asc(section.orderIndex), asc(topic.orderIndex));

	const secWeight = (s: (typeof sections)[number]) =>
		(s.marks ?? 1) * (1 + WEAKNESS_BIAS * (opts.weakness?.get(s.id) ?? 0));
	const secWeightSum = sections.reduce((a, s) => a + secWeight(s), 0) || 1;

	const allocs: { topicId: string; hours: number }[] = [];
	for (const s of sections) {
		const secTopics = topics
			.filter((t) => t.topic.sectionId === s.id)
			.map((t) => t.topic);
		if (secTopics.length === 0) continue;
		const sectionHours = totalHours * (secWeight(s) / secWeightSum);

		const allWeighted = secTopics.every(
			(t) => t.weightPct != null && t.weightPct > 0,
		);
		const weightOf = (t: (typeof secTopics)[number]) =>
			allWeighted ? (t.weightPct as number) : 1;
		const wSum = secTopics.reduce((a, t) => a + weightOf(t), 0);
		for (const t of secTopics)
			allocs.push({
				topicId: t.id,
				hours: sectionHours * (weightOf(t) / wSum),
			});
	}

	let cursor = opts.today;
	return allocs.map((a, i) => {
		const hours = round1(a.hours);
		const durationDays = Math.max(1, Math.round(hours / opts.dailyHours));
		const plannedStart = cursor;
		const plannedEnd = addDays(plannedStart, durationDays - 1);
		cursor = addDays(plannedEnd, 1);
		return {
			planId: opts.planId,
			topicId: a.topicId,
			allocatedHours: hours,
			plannedStart,
			plannedEnd,
			orderIndex: i,
		};
	});
}

export async function createPlan(input: {
	examId: string;
	targetDate: string;
	dailyHours?: number;
	notes?: string;
}) {
	const ex = await db
		.select({ id: exam.id })
		.from(exam)
		.where(eq(exam.id, input.examId))
		.limit(1);
	if (!ex[0]) throw new ExamNotFoundError(input.examId);

	if (!isISODate(input.targetDate))
		throw new InvalidDateError(
			`target date must be YYYY-MM-DD, got "${input.targetDate}"`,
		);
	const today = todayISO();
	if (daysBetween(today, input.targetDate) <= 0)
		throw new InvalidDateError(
			`target date ${input.targetDate} must be in the future`,
		);

	const dailyHours = await resolveDailyHours(input.dailyHours);

	// Archive prior active plans for this exam.
	await db
		.update(plan)
		.set({ status: "archived" })
		.where(and(eq(plan.examId, input.examId), eq(plan.status, "active")));

	const inserted = await db
		.insert(plan)
		.values({
			examId: input.examId,
			targetDate: input.targetDate,
			status: "active",
			notes: input.notes,
		})
		.returning({ id: plan.id });
	const planId = inserted[0]!.id;

	const rows = await buildPlanItems({
		examId: input.examId,
		planId,
		dailyHours,
		today,
		targetDate: input.targetDate,
	});
	if (rows.length) await db.insert(planItem).values(rows);

	return getActivePlan(input.examId);
}

/**
 * Rebuild the active plan's allocations, biased toward the sections the user
 * scored worst on in their latest mock. Keeps the same plan + target date;
 * re-lays windows from today across the remaining days.
 */
export async function reweightPlanFromMock(examId: string) {
	const p = await db
		.select()
		.from(plan)
		.where(and(eq(plan.examId, examId), eq(plan.status, "active")))
		.orderBy(desc(plan.createdAt))
		.limit(1);
	if (!p[0]) throw new NoActivePlanError(examId);

	const m = await db
		.select()
		.from(mockAttempt)
		.where(eq(mockAttempt.examId, examId))
		.orderBy(desc(mockAttempt.date), desc(mockAttempt.id))
		.limit(1);
	if (!m[0]) throw new NoMockError(examId);

	const scores = (m[0].sectionScoresJson ?? {}) as Record<string, number>;
	const sections = await db
		.select()
		.from(section)
		.where(eq(section.examId, examId));
	const weakness = new Map<string, number>();
	for (const s of sections) {
		const score = scores[s.id];
		const max = s.marks ?? 0;
		if (score != null && max > 0)
			weakness.set(s.id, Math.min(1, Math.max(0, 1 - score / max)));
	}

	const today = todayISO();
	if (daysBetween(today, p[0].targetDate) <= 0)
		throw new InvalidDateError(
			`plan target ${p[0].targetDate} is not in the future — replan with a new date`,
		);
	const dailyHours = await resolveDailyHours();

	await db.delete(planItem).where(eq(planItem.planId, p[0].id));
	const rows = await buildPlanItems({
		examId,
		planId: p[0].id,
		dailyHours,
		today,
		targetDate: p[0].targetDate,
		weakness,
	});
	if (rows.length) await db.insert(planItem).values(rows);

	return {
		plan: await getActivePlan(examId),
		basedOnMock: { id: m[0].id, name: m[0].name },
		weakness: Object.fromEntries(weakness),
	};
}

export type ActivePlan = {
	id: number;
	examId: string;
	targetDate: string;
	notes: string | null;
	daysRemaining: number;
	totalAllocatedHours: number;
	items: {
		id: number;
		topicId: string | null;
		topicName: string | null;
		allocatedHours: number | null;
		plannedStart: string | null;
		plannedEnd: string | null;
		orderIndex: number;
	}[];
};

export async function getActivePlan(
	examId: string,
): Promise<ActivePlan | null> {
	const p = await db
		.select()
		.from(plan)
		.where(and(eq(plan.examId, examId), eq(plan.status, "active")))
		.orderBy(desc(plan.createdAt))
		.limit(1);
	if (!p[0]) return null;

	const items = await db
		.select({
			id: planItem.id,
			topicId: planItem.topicId,
			topicName: topic.name,
			allocatedHours: planItem.allocatedHours,
			plannedStart: planItem.plannedStart,
			plannedEnd: planItem.plannedEnd,
			orderIndex: planItem.orderIndex,
		})
		.from(planItem)
		.leftJoin(topic, eq(planItem.topicId, topic.id))
		.where(eq(planItem.planId, p[0].id))
		.orderBy(asc(planItem.orderIndex));

	return {
		id: p[0].id,
		examId: p[0].examId,
		targetDate: p[0].targetDate,
		notes: p[0].notes,
		daysRemaining: Math.max(0, daysBetween(todayISO(), p[0].targetDate)),
		totalAllocatedHours: round1(
			items.reduce((a, i) => a + (i.allocatedHours ?? 0), 0),
		),
		items,
	};
}

/** Tweak one plan item (hours / dates / order). Does not re-cascade windows. */
export async function adjustPlanItem(
	itemId: number,
	patch: {
		allocatedHours?: number;
		plannedStart?: string;
		plannedEnd?: string;
		orderIndex?: number;
	},
) {
	const existing = await db
		.select({ id: planItem.id })
		.from(planItem)
		.where(eq(planItem.id, itemId))
		.limit(1);
	if (!existing[0]) throw new PlanItemNotFoundError(itemId);

	for (const key of ["plannedStart", "plannedEnd"] as const) {
		const v = patch[key];
		if (v !== undefined && !isISODate(v))
			throw new InvalidDateError(`${key} must be YYYY-MM-DD, got "${v}"`);
	}

	const set: Partial<typeof planItem.$inferInsert> = {};
	if (patch.allocatedHours !== undefined)
		set.allocatedHours = patch.allocatedHours;
	if (patch.plannedStart !== undefined) set.plannedStart = patch.plannedStart;
	if (patch.plannedEnd !== undefined) set.plannedEnd = patch.plannedEnd;
	if (patch.orderIndex !== undefined) set.orderIndex = patch.orderIndex;

	await db.update(planItem).set(set).where(eq(planItem.id, itemId));
	return { id: itemId, ...set };
}
