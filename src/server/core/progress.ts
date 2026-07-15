// Core progress + derived-metrics logic. This is the ONE place coverage / what-next
// are computed, so the tRPC UI and the `catac` CLI (Claude) always report the same
// numbers. Named errors let Claude self-correct instead of writing garbage.

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
	progress,
	section,
	subtopic,
	type TodoItem,
	topic,
} from "~/server/db/schema";
import { cancelReview, scheduleReview } from "./review";
import { recordSnapshot } from "./snapshot";

export const PROGRESS_STATUSES = [
	"not_started",
	"learning",
	"practiced",
	"mastered",
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

// How "done" each status counts toward coverage.
const COMPLETION: Record<ProgressStatus, number> = {
	not_started: 0,
	learning: 0.34,
	practiced: 0.67,
	mastered: 1,
};

export class UnknownSubtopicError extends Error {
	constructor(id: string) {
		super(`unknown subtopic id: "${id}"`);
		this.name = "UnknownSubtopicError";
	}
}
export class InvalidStatusError extends Error {
	constructor(s: string) {
		super(`invalid status: "${s}" (use ${PROGRESS_STATUSES.join(" | ")})`);
		this.name = "InvalidStatusError";
	}
}

export function isProgressStatus(s: string): s is ProgressStatus {
	return (PROGRESS_STATUSES as readonly string[]).includes(s);
}

export async function setProgress(input: {
	subtopicId: string;
	status: string;
	confidence?: number | null;
	notes?: string | null;
	questionsDone?: number;
	todos?: TodoItem[];
}) {
	if (!isProgressStatus(input.status))
		throw new InvalidStatusError(input.status);
	const exists = await db
		.select({ id: subtopic.id })
		.from(subtopic)
		.where(eq(subtopic.id, input.subtopicId))
		.limit(1);
	if (!exists[0]) throw new UnknownSubtopicError(input.subtopicId);

	await db
		.insert(progress)
		.values({
			subtopicId: input.subtopicId,
			status: input.status,
			confidence: input.confidence ?? null,
			notes: input.notes ?? null,
			questionsDone: input.questionsDone ?? 0,
			todos: input.todos ?? null,
		})
		.onConflictDoUpdate({
			target: progress.subtopicId,
			// Only overwrite a field when the caller actually sent it — a status-only
			// update (e.g. the table's status dropdown) must not wipe an existing
			// comment, question count, or revision checklist.
			set: {
				status: input.status,
				...(input.confidence !== undefined
					? { confidence: input.confidence }
					: {}),
				...(input.notes !== undefined ? { notes: input.notes } : {}),
				...(input.questionsDone !== undefined
					? { questionsDone: input.questionsDone }
					: {}),
				...(input.todos !== undefined ? { todos: input.todos } : {}),
			},
		});

	// Spaced repetition: schedule a review once practiced/mastered; drop it if
	// the subtopic regresses below that.
	if (input.status === "practiced" || input.status === "mastered") {
		await scheduleReview(input.subtopicId, input.status);
	} else {
		await cancelReview(input.subtopicId);
	}

	// Record today's coverage snapshot for the trend line.
	const ex = await db
		.select({ examId: section.examId })
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(subtopic.id, input.subtopicId))
		.limit(1);
	if (ex[0]) {
		const st = await getStatus(ex[0].examId);
		await recordSnapshot(ex[0].examId, st.coveragePct, {
			sections: st.sections,
			counts: st.counts,
		});
	}

	return {
		subtopicId: input.subtopicId,
		status: input.status as ProgressStatus,
	};
}

type ProgressRow = {
	subtopicId: string;
	subName: string;
	topicId: string;
	topicName: string;
	weightPct: number | null;
	sectionId: string;
	sectionShort: string;
	sectionOrder: number;
	topicOrder: number;
	subOrder: number;
	status: ProgressStatus;
	/** When the status was last changed; null if never touched (not_started). */
	updatedAt: Date | null;
	/** Free-text comment for this subtopic; null if none. */
	notes: string | null;
	/** Practice questions done for this subtopic. */
	questionsDone: number;
	/** Revision checklist; null if none. */
	todos: TodoItem[] | null;
};

/** Every subtopic for an exam, left-joined with its progress (default not_started). */
export async function getProgressRows(examId: string): Promise<ProgressRow[]> {
	const r = await db
		.select({
			subtopicId: subtopic.id,
			subName: subtopic.name,
			topicId: topic.id,
			topicName: topic.name,
			weightPct: topic.weightPct,
			sectionId: section.id,
			sectionShort: section.short,
			sectionOrder: section.orderIndex,
			topicOrder: topic.orderIndex,
			subOrder: subtopic.orderIndex,
			status: progress.status,
			updatedAt: progress.updatedAt,
			notes: progress.notes,
			questionsDone: progress.questionsDone,
			todos: progress.todos,
		})
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.leftJoin(progress, eq(progress.subtopicId, subtopic.id))
		.where(eq(section.examId, examId));

	return r.map((x) => ({
		...x,
		status: (x.status ?? "not_started") as ProgressStatus,
		questionsDone: x.questionsDone ?? 0,
	}));
}

export type ExamStatus = {
	examId: string;
	totalSubtopics: number;
	coveragePct: number;
	sections: { section: string; coveragePct: number }[];
	counts: Record<ProgressStatus, number>;
};

/** Coverage overall + per section, plus a status histogram. */
export async function getStatus(examId: string): Promise<ExamStatus> {
	const rs = await getProgressRows(examId);
	const total = rs.length;
	const overall = total
		? rs.reduce((a, x) => a + COMPLETION[x.status], 0) / total
		: 0;

	const bySection = new Map<
		string,
		{ short: string; order: number; items: number; sum: number }
	>();
	for (const x of rs) {
		const s = bySection.get(x.sectionId) ?? {
			short: x.sectionShort,
			order: x.sectionOrder,
			items: 0,
			sum: 0,
		};
		s.items++;
		s.sum += COMPLETION[x.status];
		bySection.set(x.sectionId, s);
	}
	const sections = [...bySection.values()]
		.sort((a, b) => a.order - b.order)
		.map((s) => ({
			section: s.short,
			coveragePct: Math.round((s.sum / s.items) * 100),
		}));

	const counts = Object.fromEntries(
		PROGRESS_STATUSES.map((s) => [s, 0]),
	) as Record<ProgressStatus, number>;
	for (const x of rs) counts[x.status]++;

	return {
		examId,
		totalSubtopics: total,
		coveragePct: Math.round(overall * 100),
		sections,
		counts,
	};
}

export type NextItem = {
	subtopicId: string;
	name: string;
	topic: string;
	section: string;
	status: ProgressStatus;
	weightPct: number | null;
};

/** Highest-leverage unfinished subtopics: heavier topics + less-done first. */
export async function getNext(examId: string, limit = 5): Promise<NextItem[]> {
	const rs = await getProgressRows(examId);
	const pending = rs.filter((x) => x.status !== "mastered");
	pending.sort(
		(a, b) =>
			(b.weightPct ?? 0) - (a.weightPct ?? 0) ||
			COMPLETION[a.status] - COMPLETION[b.status] ||
			a.sectionOrder - b.sectionOrder ||
			a.topicOrder - b.topicOrder ||
			a.subOrder - b.subOrder,
	);
	return pending.slice(0, limit).map((x) => ({
		subtopicId: x.subtopicId,
		name: x.subName,
		topic: x.topicName,
		section: x.sectionShort,
		status: x.status,
		weightPct: x.weightPct,
	}));
}
