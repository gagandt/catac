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
	subtopic,
	topic,
	userPref,
} from "~/server/db/schema";

export type PlanGranularity = "topic" | "subtopic";

// How much study time a subtopic gets, biased by how often the exam tests it.
const FREQ_WEIGHT: Record<string, number> = {
	high: 3,
	medium: 2,
	low: 1,
	rare: 0.5,
};
const freqWeight = (m: { frequency?: string } | null | undefined): number => {
	const f = m?.frequency;
	return f && FREQ_WEIGHT[f] != null ? FREQ_WEIGHT[f] : 1.5;
};

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

// --- mock cadence (the three tiers get auto-woven into every plan) ---------
// vision  = topic-level mini-mock  (one on each section's heaviest topic)
// subject = section-level mock     (one when a section's study block finishes)
// global  = full-length all-section mock (weekly through the back half)
const VISION_MOCK_HOURS = 0.5;
const SUBJECT_MOCK_HOURS = 1.5;
const GLOBAL_MOCK_HOURS = 3;
// Full-lengths start once ~55% of the runway is behind you (enough syllabus
// covered to make a whole paper meaningful), then repeat weekly to exam day.
const GLOBAL_MOCK_START_FRAC = 0.55;
const GLOBAL_MOCK_INTERVAL_DAYS = 7;

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
	granularity?: PlanGranularity; // default "subtopic"
	weakness?: Map<string, number>; // sectionId -> 0..1
}): Promise<(typeof planItem.$inferInsert)[]> {
	const granularity = opts.granularity ?? "subtopic";
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
	// Subtopics (with their material, for frequency-weighted time split).
	const subs = await db
		.select({
			id: subtopic.id,
			topicId: subtopic.topicId,
			material: subtopic.materialJson,
			orderIndex: subtopic.orderIndex,
		})
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, opts.examId))
		.orderBy(asc(subtopic.topicId), asc(subtopic.orderIndex));
	const subsByTopic = new Map<string, typeof subs>();
	for (const su of subs) {
		const arr = subsByTopic.get(su.topicId) ?? [];
		arr.push(su);
		subsByTopic.set(su.topicId, arr);
	}

	const secWeight = (s: (typeof sections)[number]) =>
		(s.marks ?? 1) * (1 + WEAKNESS_BIAS * (opts.weakness?.get(s.id) ?? 0));
	const secWeightSum = sections.reduce((a, s) => a + secWeight(s), 0) || 1;

	// One study allocation per subtopic (or per topic if granularity="topic" or
	// a topic has no subtopics). Section share by marks/weakness, within-section
	// by topic weight, within-topic by subtopic exam-frequency.
	type Alloc = {
		topicId: string;
		subtopicId: string | null;
		sectionId: string;
		hours: number;
	};
	const allocs: Alloc[] = [];
	const heaviestTopic = new Map<string, string>(); // sectionId -> topicId
	const sectionShort = new Map<string, string>(); // sectionId -> short label
	for (const s of sections) {
		sectionShort.set(s.id, s.short ?? s.name);
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
		let best: { id: string; w: number } | null = null;
		for (const t of secTopics) {
			const topicHours = sectionHours * (weightOf(t) / wSum);
			const tsubs =
				granularity === "subtopic" ? (subsByTopic.get(t.id) ?? []) : [];
			if (tsubs.length === 0) {
				allocs.push({
					topicId: t.id,
					subtopicId: null,
					sectionId: s.id,
					hours: topicHours,
				});
			} else {
				const fwSum =
					tsubs.reduce((a, su) => a + freqWeight(su.material), 0) || 1;
				for (const su of tsubs)
					allocs.push({
						topicId: t.id,
						subtopicId: su.id,
						sectionId: s.id,
						hours: topicHours * (freqWeight(su.material) / fwSum),
					});
			}
			if (!best || weightOf(t) > best.w) best = { id: t.id, w: weightOf(t) };
		}
		if (best) heaviestTopic.set(s.id, best.id);
	}

	// 1) Lay study windows consecutively from today, recording where each topic
	//    and each section finishes so mocks can land on those checkpoints.
	const topicName = new Map(topics.map((t) => [t.topic.id, t.topic.name]));
	const rows: (typeof planItem.$inferInsert)[] = [];
	const topicEnd = new Map<string, string>();
	const sectionEnd = new Map<string, string>();
	let cursor = opts.today;
	for (const a of allocs) {
		const hours = round1(a.hours);
		const durationDays = Math.max(1, Math.round(hours / opts.dailyHours));
		const plannedStart = cursor;
		const plannedEnd = addDays(plannedStart, durationDays - 1);
		cursor = addDays(plannedEnd, 1);
		topicEnd.set(a.topicId, plannedEnd); // last subtopic wins = topic's end
		sectionEnd.set(a.sectionId, plannedEnd); // last wins = section's end
		rows.push({
			planId: opts.planId,
			kind: "study",
			topicId: a.topicId,
			subtopicId: a.subtopicId,
			sectionId: a.sectionId,
			allocatedHours: hours,
			plannedStart,
			plannedEnd,
			// orderIndex assigned after the timeline is merged (see below).
			orderIndex: 0,
		});
	}

	// clamp any date to the study runway [today, targetDate]
	const clamp = (iso: string) =>
		daysBetween(iso, opts.targetDate) < 0 ? opts.targetDate : iso;

	// 2) Vision mocks — one per section, the day its heaviest topic wraps up.
	for (const [sectionId, topicId] of heaviestTopic) {
		const day = clamp(addDays(topicEnd.get(topicId) ?? opts.today, 1));
		rows.push({
			planId: opts.planId,
			kind: "mock",
			mockTier: "vision",
			topicId,
			sectionId,
			title: `${topicName.get(topicId) ?? "Topic"} mini-mock`,
			allocatedHours: VISION_MOCK_HOURS,
			plannedStart: day,
			plannedEnd: day,
			orderIndex: 0,
		});
	}

	// 3) Subject mocks — one per section, the day that section's study finishes.
	for (const [sectionId, end] of sectionEnd) {
		const day = clamp(addDays(end, 1));
		rows.push({
			planId: opts.planId,
			kind: "mock",
			mockTier: "subject",
			sectionId,
			title: `${sectionShort.get(sectionId) ?? "Section"} sectional mock`,
			allocatedHours: SUBJECT_MOCK_HOURS,
			plannedStart: day,
			plannedEnd: day,
			orderIndex: 0,
		});
	}

	// 4) Global full-lengths — weekly from ~55% of the runway to exam day.
	let g = 1;
	let mockDay = addDays(
		opts.today,
		Math.round(daysAvailable * GLOBAL_MOCK_START_FRAC),
	);
	while (daysBetween(mockDay, opts.targetDate) >= 0) {
		rows.push({
			planId: opts.planId,
			kind: "mock",
			mockTier: "global",
			title: `Full-length mock ${g}`,
			allocatedHours: GLOBAL_MOCK_HOURS,
			plannedStart: mockDay,
			plannedEnd: mockDay,
			orderIndex: 0,
		});
		g += 1;
		mockDay = addDays(mockDay, GLOBAL_MOCK_INTERVAL_DAYS);
	}

	// 5) Merge everything onto one timeline. Order by start date, then put study
	//    ahead of its checkpoint mocks on the same day.
	const tierRank: Record<string, number> = {
		study: 0,
		vision: 1,
		subject: 2,
		global: 3,
	};
	rows.sort((a, b) => {
		const d = (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "");
		if (d !== 0) return d;
		return (
			(tierRank[a.mockTier ?? a.kind ?? "study"] ?? 0) -
			(tierRank[b.mockTier ?? b.kind ?? "study"] ?? 0)
		);
	});
	rows.forEach((r, i) => {
		r.orderIndex = i;
	});
	return rows;
}

export async function createPlan(input: {
	examId: string;
	targetDate: string;
	dailyHours?: number;
	granularity?: PlanGranularity;
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
		granularity: input.granularity,
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

export type PlanItemKind = "study" | "mock";
export type MockTier = "vision" | "subject" | "global";
export type PlanPriority = "normal" | "high";

export type ActivePlanItem = {
	id: number;
	kind: PlanItemKind;
	mockTier: MockTier | null;
	topicId: string | null;
	topicName: string | null;
	subtopicId: string | null;
	subtopicName: string | null;
	sectionId: string | null;
	sectionName: string | null;
	title: string | null; // display label (subtopic/topic name, or mock name)
	allocatedHours: number | null;
	plannedStart: string | null;
	plannedEnd: string | null;
	priority: PlanPriority;
	orderIndex: number;
};

export type ActivePlan = {
	id: number;
	examId: string;
	targetDate: string;
	notes: string | null;
	daysRemaining: number;
	totalAllocatedHours: number;
	items: ActivePlanItem[];
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

	const sections = await db
		.select({ id: section.id, name: section.name })
		.from(section)
		.where(eq(section.examId, examId));
	const sectionName = new Map(sections.map((s) => [s.id, s.name]));

	const raw = await db
		.select({
			id: planItem.id,
			kind: planItem.kind,
			mockTier: planItem.mockTier,
			topicId: planItem.topicId,
			topicName: topic.name,
			topicSectionId: topic.sectionId,
			subtopicId: planItem.subtopicId,
			subtopicName: subtopic.name,
			sectionId: planItem.sectionId,
			title: planItem.title,
			allocatedHours: planItem.allocatedHours,
			plannedStart: planItem.plannedStart,
			plannedEnd: planItem.plannedEnd,
			priority: planItem.priority,
			orderIndex: planItem.orderIndex,
		})
		.from(planItem)
		.leftJoin(topic, eq(planItem.topicId, topic.id))
		.leftJoin(subtopic, eq(planItem.subtopicId, subtopic.id))
		.where(eq(planItem.planId, p[0].id))
		.orderBy(asc(planItem.orderIndex));

	const items: ActivePlanItem[] = raw.map((r) => {
		const sectionId = r.sectionId ?? r.topicSectionId ?? null;
		return {
			id: r.id,
			kind: (r.kind as PlanItemKind) ?? "study",
			mockTier: (r.mockTier as MockTier | null) ?? null,
			topicId: r.topicId,
			topicName: r.topicName,
			subtopicId: r.subtopicId,
			subtopicName: r.subtopicName,
			sectionId,
			sectionName: sectionId ? (sectionName.get(sectionId) ?? null) : null,
			title: r.title ?? r.subtopicName ?? r.topicName,
			allocatedHours: r.allocatedHours,
			plannedStart: r.plannedStart,
			plannedEnd: r.plannedEnd,
			priority: (r.priority as PlanPriority) ?? "normal",
			orderIndex: r.orderIndex,
		};
	});

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

// --- drag-and-drop board operations --------------------------------------

/**
 * Persist a new top-to-bottom order for a set of plan items (a drag reorder).
 * `orderedIds` is the full desired sequence; each item's orderIndex becomes its
 * position in that list.
 */
export async function reorderPlanItems(orderedIds: number[]) {
	await Promise.all(
		orderedIds.map((id, i) =>
			db.update(planItem).set({ orderIndex: i }).where(eq(planItem.id, id)),
		),
	);
	return { count: orderedIds.length };
}

/**
 * Move an item to a new start date (dragging it into another day/week/month),
 * preserving its duration so a multi-day study block keeps its length.
 */
export async function movePlanItem(itemId: number, newStart: string) {
	if (!isISODate(newStart))
		throw new InvalidDateError(`start must be YYYY-MM-DD, got "${newStart}"`);
	const existing = await db
		.select({
			start: planItem.plannedStart,
			end: planItem.plannedEnd,
		})
		.from(planItem)
		.where(eq(planItem.id, itemId))
		.limit(1);
	if (!existing[0]) throw new PlanItemNotFoundError(itemId);

	const { start, end } = existing[0];
	const duration = start && end ? Math.max(0, daysBetween(start, end)) : 0;
	const newEnd = addDays(newStart, duration);
	await db
		.update(planItem)
		.set({ plannedStart: newStart, plannedEnd: newEnd })
		.where(eq(planItem.id, itemId));
	return { id: itemId, plannedStart: newStart, plannedEnd: newEnd };
}

/** Flag or unflag an item as high priority (a star on the board). */
export async function setPlanItemPriority(
	itemId: number,
	priority: PlanPriority,
) {
	const existing = await db
		.select({ id: planItem.id })
		.from(planItem)
		.where(eq(planItem.id, itemId))
		.limit(1);
	if (!existing[0]) throw new PlanItemNotFoundError(itemId);
	await db.update(planItem).set({ priority }).where(eq(planItem.id, itemId));
	return { id: itemId, priority };
}

/**
 * Add a node to the active plan by hand — a study topic or one of the three
 * mock tiers. Appends to the end of the timeline unless a start date is given.
 */
export async function addPlanItem(input: {
	examId: string;
	kind: PlanItemKind;
	topicId?: string;
	subtopicId?: string;
	sectionId?: string;
	mockTier?: MockTier;
	title?: string;
	plannedStart?: string;
	allocatedHours?: number;
	priority?: PlanPriority;
}) {
	const p = await db
		.select({ id: plan.id })
		.from(plan)
		.where(and(eq(plan.examId, input.examId), eq(plan.status, "active")))
		.orderBy(desc(plan.createdAt))
		.limit(1);
	if (!p[0]) throw new NoActivePlanError(input.examId);

	if (input.plannedStart && !isISODate(input.plannedStart))
		throw new InvalidDateError(
			`start must be YYYY-MM-DD, got "${input.plannedStart}"`,
		);

	// If a subtopic was given, resolve its topic/section so context is complete.
	let topicId = input.topicId;
	let sectionId = input.sectionId;
	let subName: string | null = null;
	if (input.kind === "study" && input.subtopicId) {
		const su = await db
			.select({
				name: subtopic.name,
				topicId: subtopic.topicId,
				sectionId: topic.sectionId,
			})
			.from(subtopic)
			.innerJoin(topic, eq(subtopic.topicId, topic.id))
			.where(eq(subtopic.id, input.subtopicId))
			.limit(1);
		if (su[0]) {
			subName = su[0].name;
			topicId = topicId ?? su[0].topicId;
			sectionId = sectionId ?? su[0].sectionId;
		}
	}

	// Derive a sensible title if the caller didn't give one.
	let title = input.title ?? subName ?? null;
	if (!title && input.kind === "study" && topicId) {
		const t = await db
			.select({ name: topic.name })
			.from(topic)
			.where(eq(topic.id, topicId))
			.limit(1);
		title = t[0]?.name ?? null;
	}

	const maxOrder = await db
		.select({ o: planItem.orderIndex })
		.from(planItem)
		.where(eq(planItem.planId, p[0].id))
		.orderBy(desc(planItem.orderIndex))
		.limit(1);
	const orderIndex = (maxOrder[0]?.o ?? -1) + 1;

	const start = input.plannedStart ?? todayISO();
	const inserted = await db
		.insert(planItem)
		.values({
			planId: p[0].id,
			kind: input.kind,
			mockTier: input.kind === "mock" ? (input.mockTier ?? "global") : null,
			topicId,
			subtopicId: input.subtopicId,
			sectionId,
			title,
			allocatedHours: input.allocatedHours,
			plannedStart: start,
			plannedEnd: start,
			priority: input.priority ?? "normal",
			orderIndex,
		})
		.returning({ id: planItem.id });
	return { id: inserted[0]!.id };
}

/** Remove a node from the plan. */
export async function deletePlanItem(itemId: number) {
	const existing = await db
		.select({ id: planItem.id })
		.from(planItem)
		.where(eq(planItem.id, itemId))
		.limit(1);
	if (!existing[0]) throw new PlanItemNotFoundError(itemId);
	await db.delete(planItem).where(eq(planItem.id, itemId));
	return { id: itemId, deleted: true };
}

/**
 * Study subtopics available to add to a plan (for the board's "add node"
 * picker). One row per subtopic, ordered section › topic › subtopic.
 */
export async function planTopicOptions(examId: string) {
	const rows = await db
		.select({
			subtopicId: subtopic.id,
			subtopicName: subtopic.name,
			topicId: topic.id,
			topicName: topic.name,
			sectionId: section.id,
			sectionName: section.name,
		})
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, examId))
		.orderBy(
			asc(section.orderIndex),
			asc(topic.orderIndex),
			asc(subtopic.orderIndex),
		);
	return rows;
}
