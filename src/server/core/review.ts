// Spaced-repetition scheduling (SM-2-ish). Reaching `practiced`/`mastered` on a
// subtopic schedules a review; grading a review pushes the next due date out (or
// resets it on a poor grade), so mastered topics resurface before they decay.

import { and, asc, eq, lte } from "drizzle-orm";

import { db } from "~/server/db";
import { reviewItem, section, subtopic, topic } from "~/server/db/schema";

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

export class NoReviewError extends Error {
	constructor(subtopicId: string) {
		super(`no review scheduled for "${subtopicId}"`);
		this.name = "NoReviewError";
	}
}

const FIRST_INTERVAL: Record<"practiced" | "mastered", number> = {
	practiced: 2,
	mastered: 4,
};

/** Called when progress reaches practiced/mastered. Idempotent per subtopic. */
export async function scheduleReview(
	subtopicId: string,
	status: "practiced" | "mastered",
) {
	const interval = FIRST_INTERVAL[status];
	const dueDate = addDays(todayISO(), interval);
	await db
		.insert(reviewItem)
		.values({ subtopicId, dueDate, intervalDays: interval, ease: 2.5 })
		.onConflictDoUpdate({
			target: reviewItem.subtopicId,
			set: { dueDate, intervalDays: interval },
		});
}

/** Called when a subtopic drops below practiced — no longer worth reviewing. */
export async function cancelReview(subtopicId: string) {
	await db.delete(reviewItem).where(eq(reviewItem.subtopicId, subtopicId));
}

export async function getDueReviews(examId: string, asOf = todayISO()) {
	return db
		.select({
			id: reviewItem.id,
			subtopicId: reviewItem.subtopicId,
			subName: subtopic.name,
			topic: topic.name,
			section: section.short,
			dueDate: reviewItem.dueDate,
			intervalDays: reviewItem.intervalDays,
		})
		.from(reviewItem)
		.innerJoin(subtopic, eq(reviewItem.subtopicId, subtopic.id))
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(and(eq(section.examId, examId), lte(reviewItem.dueDate, asOf)))
		.orderBy(asc(reviewItem.dueDate));
}

/**
 * Grade a review (0-5). <3 resets the interval; >=3 grows it by the ease factor,
 * SM-2 style, and nudges ease. Returns the next due date.
 */
export async function reviewDone(subtopicId: string, grade: number) {
	const r = await db
		.select()
		.from(reviewItem)
		.where(eq(reviewItem.subtopicId, subtopicId))
		.limit(1);
	if (!r[0]) throw new NoReviewError(subtopicId);

	let interval = r[0].intervalDays;
	let ease = r[0].ease;

	if (grade < 3) {
		interval = 1;
	} else {
		interval =
			interval <= 1 ? (grade >= 4 ? 4 : 2) : Math.round(interval * ease);
		ease = Math.max(
			1.3,
			ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
		);
		ease = Math.round(ease * 100) / 100;
	}

	const dueDate = addDays(todayISO(), interval);
	await db
		.update(reviewItem)
		.set({ intervalDays: interval, ease, dueDate })
		.where(eq(reviewItem.subtopicId, subtopicId));

	return { subtopicId, intervalDays: interval, ease, dueDate };
}
