// Multi-exam date tracker. Stores key dates (registration, admit card, exam day,
// results) for the exams we watch on the calendar page. Dates are refreshed by
// Claude via web research (`/refresh-exam-dates`), written through the CLI/core
// so the UI and Claude never disagree.

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { examEvent } from "~/server/db/schema";

// The fixed set of exams the calendar tracks. `id` is the event key; not every
// id has a full syllabus pack (snap/nmat are date-only unless /add-exam'd).
export const TRACKED_EXAMS = [
	{ id: "cat", name: "CAT", fullName: "Common Admission Test" },
	{ id: "gmat", name: "GMAT", fullName: "Graduate Management Admission Test" },
	{ id: "xat", name: "XAT", fullName: "Xavier Aptitude Test" },
	{ id: "snap", name: "SNAP", fullName: "Symbiosis National Aptitude Test" },
	{ id: "nmat", name: "NMAT", fullName: "NMAT by GMAC" },
] as const;

export type TrackedExamId = (typeof TRACKED_EXAMS)[number]["id"];

export const EVENT_KINDS = [
	"registration",
	"admit_card",
	"exam_day",
	"result",
	"window",
	"other",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

function isISODate(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export class InvalidEventError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = "InvalidEventError";
	}
}

export type ExamEventInput = {
	kind: string;
	label: string;
	date: string;
	endDate?: string;
	notes?: string;
	source?: string;
};

export type ExamEventRow = {
	id: number;
	examId: string;
	examName: string;
	kind: string;
	label: string;
	date: string;
	endDate: string | null;
	notes: string | null;
	source: string | null;
	updatedAt: Date | null;
};

const nameOf = (id: string) =>
	TRACKED_EXAMS.find((e) => e.id === id)?.name ?? id.toUpperCase();

/** All tracked exam events, chronologically. Optionally filter to one exam. */
export async function listExamEvents(examId?: string): Promise<ExamEventRow[]> {
	const rows = examId
		? await db
				.select()
				.from(examEvent)
				.where(eq(examEvent.examId, examId))
				.orderBy(asc(examEvent.date))
		: await db.select().from(examEvent).orderBy(asc(examEvent.date));
	return rows.map((r) => ({
		id: r.id,
		examId: r.examId,
		examName: nameOf(r.examId),
		kind: r.kind,
		label: r.label,
		date: r.date,
		endDate: r.endDate,
		notes: r.notes,
		source: r.source,
		updatedAt: r.updatedAt,
	}));
}

/** The most recent time ANY event was written — powers the "dates as of" line. */
export async function eventsLastUpdated(): Promise<Date | null> {
	const rows = await db
		.select({ updatedAt: examEvent.updatedAt })
		.from(examEvent);
	let latest: Date | null = null;
	for (const r of rows)
		if (r.updatedAt && (!latest || r.updatedAt > latest)) latest = r.updatedAt;
	return latest;
}

function validate(examId: string, e: ExamEventInput) {
	if (!TRACKED_EXAMS.some((x) => x.id === examId))
		throw new InvalidEventError(
			`unknown tracked exam "${examId}" (expected ${TRACKED_EXAMS.map((x) => x.id).join("/")})`,
		);
	if (!isISODate(e.date))
		throw new InvalidEventError(`date must be YYYY-MM-DD, got "${e.date}"`);
	if (e.endDate && !isISODate(e.endDate))
		throw new InvalidEventError(
			`endDate must be YYYY-MM-DD, got "${e.endDate}"`,
		);
	if (!e.label?.trim()) throw new InvalidEventError("event needs a label");
}

/** Add a single dated event for a tracked exam. */
export async function addExamEvent(examId: string, e: ExamEventInput) {
	validate(examId, e);
	const inserted = await db
		.insert(examEvent)
		.values({
			examId,
			kind: e.kind || "other",
			label: e.label,
			date: e.date,
			endDate: e.endDate,
			notes: e.notes,
			source: e.source,
		})
		.returning({ id: examEvent.id });
	return { id: inserted[0]!.id };
}

/** Replace ALL events for one exam (a refresh writes a fresh cycle at once). */
export async function setExamEvents(examId: string, events: ExamEventInput[]) {
	for (const e of events) validate(examId, e);
	await db.delete(examEvent).where(eq(examEvent.examId, examId));
	if (events.length)
		await db.insert(examEvent).values(
			events.map((e) => ({
				examId,
				kind: e.kind || "other",
				label: e.label,
				date: e.date,
				endDate: e.endDate,
				notes: e.notes,
				source: e.source,
			})),
		);
	return { examId, count: events.length };
}

/** Wipe all events for one exam. */
export async function clearExamEvents(examId: string) {
	await db.delete(examEvent).where(eq(examEvent.examId, examId));
	return { examId, cleared: true };
}

/** Delete one event by id. */
export async function deleteExamEvent(id: number) {
	await db.delete(examEvent).where(eq(examEvent.id, id));
	return { id, deleted: true };
}
