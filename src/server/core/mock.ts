// Mock-test logging. Feeds adaptive re-planning (plan.reweightPlanFromMock):
// a mock's per-section scores reveal weak sections, which get more plan time.

import { desc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { exam, mockAttempt } from "~/server/db/schema";
import { ExamNotFoundError, todayISO } from "./plan";

export async function logMock(input: {
	examId: string;
	name?: string;
	date?: string;
	sectionScores: Record<string, number>; // keyed by section id, e.g. { varc: 30 }
	estPercentile?: number;
	notes?: string;
}) {
	const ex = await db
		.select({ id: exam.id })
		.from(exam)
		.where(eq(exam.id, input.examId))
		.limit(1);
	if (!ex[0]) throw new ExamNotFoundError(input.examId);

	const total = Object.values(input.sectionScores).reduce((a, b) => a + b, 0);
	const date = input.date ?? todayISO();
	const name = input.name ?? `Mock ${date}`;

	const ins = await db
		.insert(mockAttempt)
		.values({
			examId: input.examId,
			name,
			date,
			sectionScoresJson: input.sectionScores,
			total,
			estPercentile: input.estPercentile ?? null,
			analysisNotes: input.notes ?? null,
		})
		.returning({ id: mockAttempt.id });

	return {
		id: ins[0]!.id,
		examId: input.examId,
		name,
		date,
		total,
		sectionScores: input.sectionScores,
	};
}

export async function listMocks(examId: string) {
	return db
		.select()
		.from(mockAttempt)
		.where(eq(mockAttempt.examId, examId))
		.orderBy(desc(mockAttempt.date), desc(mockAttempt.id));
}
