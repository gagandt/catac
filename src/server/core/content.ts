// Content import/export — the single code path for getting an exam's syllabus
// into and out of the DB. `bun db:seed` and `catac pack import` both call
// importExamContent; `catac pack export` reconstructs the same shape from the DB.
// A "pack" is exam content only (no personal progress), so it's safe to share.

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
	exam,
	examScoring,
	resource,
	section,
	type SubtopicMaterial,
	subtopic,
	topic,
} from "~/server/db/schema";
import { ExamNotFoundError } from "./plan";

// A subtopic in a pack is either a bare name (legacy) or a name + study material.
export type PackSubtopic = { name: string } & SubtopicMaterial;
export type PackTopic = {
	id: string;
	name: string;
	weightPct?: number | null;
	priority?: string | null;
	subtopics?: (string | PackSubtopic)[];
};

// Split a pack subtopic entry into its name and its material blob (or null).
function normalizeSubtopic(entry: string | PackSubtopic): {
	name: string;
	material: SubtopicMaterial | null;
} {
	if (typeof entry === "string") return { name: entry, material: null };
	const { name, ...material } = entry;
	const hasMaterial = Object.values(material).some((v) => v != null);
	return { name, material: hasMaterial ? material : null };
}
export type PackSection = {
	id: string;
	name: string;
	short: string;
	questions?: number | null;
	marks?: number | null;
	timeMinutes?: number | null;
	topics?: PackTopic[];
};
export type PackResourceObj = {
	name: string;
	strength?: string;
	detail?: string;
	url?: string;
};
export type ExamPack = {
	id: string;
	name: string;
	fullName: string;
	meta?: unknown;
	pattern?: unknown;
	strategy?: unknown;
	scoring?: unknown;
	scoringKind?: string; // e.g. percentile_bands | gmat_scaled — how to read `scoring`
	sections?: PackSection[];
	resources?: {
		youtube?: PackResourceObj[];
		mocks?: PackResourceObj[];
		reading?: string[];
		communities?: string[];
	};
};

export type ImportStats = {
	sectionCount: number;
	topicCount: number;
	subtopicCount: number;
	resourceCount: number;
};

/** Idempotent upsert of one exam's content. Stable ids => re-import never orphans progress. */
export async function importExamContent(
	content: ExamPack,
): Promise<ImportStats> {
	const metaJson = {
		meta: content.meta,
		pattern: content.pattern,
		strategy: content.strategy,
	};
	await db
		.insert(exam)
		.values({
			id: content.id,
			name: content.name,
			fullName: content.fullName,
			metaJson,
		})
		.onConflictDoUpdate({
			target: exam.id,
			set: { name: content.name, fullName: content.fullName, metaJson },
		});

	let sectionCount = 0;
	let topicCount = 0;
	let subtopicCount = 0;

	for (const [si, s] of (content.sections ?? []).entries()) {
		await db
			.insert(section)
			.values({
				id: s.id,
				examId: content.id,
				name: s.name,
				short: s.short,
				questions: s.questions ?? null,
				marks: s.marks ?? null,
				timeMinutes: s.timeMinutes ?? null,
				orderIndex: si,
			})
			.onConflictDoUpdate({
				target: section.id,
				set: {
					examId: content.id,
					name: s.name,
					short: s.short,
					questions: s.questions ?? null,
					marks: s.marks ?? null,
					timeMinutes: s.timeMinutes ?? null,
					orderIndex: si,
				},
			});
		sectionCount++;

		for (const [ti, t] of (s.topics ?? []).entries()) {
			await db
				.insert(topic)
				.values({
					id: t.id,
					sectionId: s.id,
					name: t.name,
					weightPct: t.weightPct ?? null,
					priority: t.priority ?? null,
					orderIndex: ti,
				})
				.onConflictDoUpdate({
					target: topic.id,
					set: {
						sectionId: s.id,
						name: t.name,
						weightPct: t.weightPct ?? null,
						priority: t.priority ?? null,
						orderIndex: ti,
					},
				});
			topicCount++;

			for (const [subi, entry] of (t.subtopics ?? []).entries()) {
				const subId = `${t.id}-s${subi + 1}`;
				const { name: subName, material } = normalizeSubtopic(entry);
				await db
					.insert(subtopic)
					.values({
						id: subId,
						topicId: t.id,
						name: subName,
						materialJson: material,
						orderIndex: subi,
					})
					.onConflictDoUpdate({
						target: subtopic.id,
						set: {
							topicId: t.id,
							name: subName,
							materialJson: material,
							orderIndex: subi,
						},
					});
				subtopicCount++;
			}
		}
	}

	// Resources + scoring: replace-per-exam (autoincrement ids, no stable key).
	await db.delete(resource).where(eq(resource.examId, content.id));
	const resourceRows: (typeof resource.$inferInsert)[] = [];
	for (const r of content.resources?.youtube ?? [])
		resourceRows.push({
			examId: content.id,
			kind: "youtube",
			name: r.name,
			detail: r.strength ?? r.detail,
			url: r.url,
		});
	for (const r of content.resources?.mocks ?? [])
		resourceRows.push({
			examId: content.id,
			kind: "mock",
			name: r.name,
			detail: r.detail ?? r.strength,
			url: r.url,
		});
	for (const r of content.resources?.reading ?? [])
		resourceRows.push({ examId: content.id, kind: "reading", name: r });
	for (const r of content.resources?.communities ?? [])
		resourceRows.push({ examId: content.id, kind: "community", name: r });
	if (resourceRows.length) await db.insert(resource).values(resourceRows);

	await db.delete(examScoring).where(eq(examScoring.examId, content.id));
	if (content.scoring) {
		await db.insert(examScoring).values({
			examId: content.id,
			kind: content.scoringKind ?? "percentile_bands",
			dataJson: content.scoring,
		});
	}

	return {
		sectionCount,
		topicCount,
		subtopicCount,
		resourceCount: resourceRows.length,
	};
}

/** Reconstruct an exam's content from the DB into a shareable pack. No progress. */
export async function exportExamContent(examId: string): Promise<ExamPack> {
	const ex = await db.select().from(exam).where(eq(exam.id, examId)).limit(1);
	if (!ex[0]) throw new ExamNotFoundError(examId);
	const meta = (ex[0].metaJson ?? {}) as {
		meta?: unknown;
		pattern?: unknown;
		strategy?: unknown;
	};

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
	const subs = await db
		.select()
		.from(subtopic)
		.innerJoin(topic, eq(subtopic.topicId, topic.id))
		.innerJoin(section, eq(topic.sectionId, section.id))
		.where(eq(section.examId, examId))
		.orderBy(asc(subtopic.orderIndex));

	const packSections: PackSection[] = sections.map((s) => ({
		id: s.id,
		name: s.name,
		short: s.short,
		questions: s.questions,
		marks: s.marks,
		timeMinutes: s.timeMinutes,
		topics: topics
			.filter((row) => row.topic.sectionId === s.id)
			.map((row) => ({
				id: row.topic.id,
				name: row.topic.name,
				weightPct: row.topic.weightPct,
				priority: row.topic.priority,
				subtopics: subs
					.filter((x) => x.subtopic.topicId === row.topic.id)
					.map((x): string | PackSubtopic =>
						x.subtopic.materialJson
							? { name: x.subtopic.name, ...x.subtopic.materialJson }
							: x.subtopic.name,
					),
			})),
	}));

	const resources = await db
		.select()
		.from(resource)
		.where(eq(resource.examId, examId));
	const scoringRow = await db
		.select()
		.from(examScoring)
		.where(eq(examScoring.examId, examId))
		.limit(1);

	return {
		id: ex[0].id,
		name: ex[0].name,
		fullName: ex[0].fullName,
		meta: meta.meta,
		pattern: meta.pattern,
		strategy: meta.strategy,
		scoring: scoringRow[0]?.dataJson,
		scoringKind: scoringRow[0]?.kind,
		sections: packSections,
		resources: {
			youtube: resources
				.filter((r) => r.kind === "youtube")
				.map((r) => ({
					name: r.name,
					strength: r.detail ?? undefined,
					url: r.url ?? undefined,
				})),
			mocks: resources
				.filter((r) => r.kind === "mock")
				.map((r) => ({
					name: r.name,
					detail: r.detail ?? undefined,
					url: r.url ?? undefined,
				})),
			reading: resources.filter((r) => r.kind === "reading").map((r) => r.name),
			communities: resources
				.filter((r) => r.kind === "community")
				.map((r) => r.name),
		},
	};
}
