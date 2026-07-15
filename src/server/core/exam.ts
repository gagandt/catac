// Core domain logic for exams + syllabus. This is the single source of behavior
// that BOTH the tRPC UI and the (future) `catac` CLI call — so the UI and Claude
// can never report different things. Keep query + business logic here, not in
// the router or the CLI.

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { exam, resource, section, subtopic, topic } from "~/server/db/schema";

export async function listExams() {
	return db.select().from(exam).orderBy(asc(exam.id));
}

export async function getExam(examId: string) {
	const rows = await db.select().from(exam).where(eq(exam.id, examId)).limit(1);
	return rows[0] ?? null;
}

export type SyllabusTopic = typeof topic.$inferSelect & {
	subtopics: (typeof subtopic.$inferSelect)[];
};
export type SyllabusSection = typeof section.$inferSelect & {
	topics: SyllabusTopic[];
};

/**
 * Full nested syllabus tree for one exam: section -> topic -> subtopic.
 * Ordered by orderIndex at every level so the UI and Claude see the same shape.
 */
export async function getSyllabus(examId: string): Promise<SyllabusSection[]> {
	const sections = await db
		.select()
		.from(section)
		.where(eq(section.examId, examId))
		.orderBy(asc(section.orderIndex));

	const topics = await db
		.select()
		.from(topic)
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, examId))
		.orderBy(asc(topic.orderIndex));

	const subtopics = await db
		.select()
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, examId))
		.orderBy(asc(subtopic.orderIndex));

	return sections.map((s) => ({
		...s,
		topics: topics
			.filter((row) => row.topic.sectionId === s.id)
			.map((row) => ({
				...row.topic,
				subtopics: subtopics
					.filter((sub) => sub.subtopic.topicId === row.topic.id)
					.map((sub) => sub.subtopic),
			})),
	}));
}

export async function listResources(examId: string) {
	return db.select().from(resource).where(eq(resource.examId, examId));
}
