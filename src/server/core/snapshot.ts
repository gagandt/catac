// Daily coverage snapshots — one row per exam per day, upserted whenever progress
// changes. Powers the dashboard trajectory line. Pure writer/reader: takes the
// already-computed coverage so it never imports back into progress (no cycle).

import { asc, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { snapshot } from "~/server/db/schema";

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

export async function recordSnapshot(
	examId: string,
	coveragePct: number,
	metrics?: Record<string, unknown>,
) {
	const date = todayISO();
	await db
		.insert(snapshot)
		.values({ examId, date, coveragePct, metricsJson: metrics })
		.onConflictDoUpdate({
			target: [snapshot.examId, snapshot.date],
			set: { coveragePct, metricsJson: metrics },
		});
}

export async function getSnapshots(examId: string, limit = 90) {
	return db
		.select({
			date: snapshot.date,
			coveragePct: snapshot.coveragePct,
		})
		.from(snapshot)
		.where(eq(snapshot.examId, examId))
		.orderBy(asc(snapshot.date))
		.limit(limit);
}
