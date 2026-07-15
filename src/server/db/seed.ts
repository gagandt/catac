// Seeds CONTENT from content/<exam>.json into the local DB via the shared
// importExamContent core (same path as `catac pack import`). Idempotent: stable
// ids, upsert. Authoring-time only — the running app never reads these files.
//
//   bun db:seed            # seeds every content/*.json
//   bun db:seed cat        # seeds only content/cat.json

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExamPack, importExamContent } from "~/server/core/content";
import { client } from "~/server/db";

async function main() {
	const only = process.argv[2]; // optional exam slug
	const dir = join(process.cwd(), "content");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.filter((f) => !only || f === `${only}.json`);

	if (files.length === 0) {
		console.error(
			`No content files to seed (dir: ${dir}, filter: ${only ?? "*"}).`,
		);
		process.exit(1);
	}

	// WAL so concurrent UI + CLI writes don't lock the file.
	await client.execute("PRAGMA journal_mode=WAL;").catch(() => {});

	for (const f of files) {
		const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as ExamPack;
		const s = await importExamContent(raw);
		console.log(
			`seeded ${raw.id}: ${s.sectionCount} sections, ${s.topicCount} topics, ${s.subtopicCount} subtopics, ${s.resourceCount} resources`,
		);
	}

	console.log("done.");
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
