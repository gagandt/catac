#!/usr/bin/env bun
// `catac` — the CLI Claude drives. Thin wrapper over src/server/core/*; all logic
// lives in the core so the CLI and the web UI stay in lockstep.
//
//   bun run catac exam list
//   bun run catac syllabus cat
//   bun run catac progress set qa-arithmetic-s1 mastered --confidence 4
//   bun run catac progress show [cat]
//   bun run catac status [cat]
//   bun run catac next [cat] [--limit 5]
//
// Add --json to any command for machine-readable output (skills use this).
// Exit code 1 + a named error on bad input, so Claude can self-correct.

import { readFileSync, writeFileSync } from "node:fs";

import {
	type ExamPack,
	exportExamContent,
	importExamContent,
} from "~/server/core/content";
import { getSyllabus, listExams } from "~/server/core/exam";
import { listMocks, logMock } from "~/server/core/mock";
import {
	adjustPlanItem,
	createPlan,
	getActivePlan,
	reweightPlanFromMock,
} from "~/server/core/plan";
import {
	getNext,
	getProgressRows,
	getStatus,
	setProgress,
} from "~/server/core/progress";
import { getDueReviews, reviewDone } from "~/server/core/review";

// --- tiny arg parser: positionals + `--key value` / boolean `--flag` ---
const raw = process.argv.slice(2);
const pos: string[] = [];
const opts: Record<string, string | boolean> = {};
for (let i = 0; i < raw.length; i++) {
	const t = raw[i]!;
	if (t.startsWith("--")) {
		const key = t.slice(2);
		const next = raw[i + 1];
		if (key === "json" || next === undefined || next.startsWith("--")) {
			opts[key] = true;
		} else {
			opts[key] = next;
			i++;
		}
	} else {
		pos.push(t);
	}
}
const asJson = opts.json === true;

function out(human: string, data: unknown) {
	if (asJson) console.log(JSON.stringify(data, null, 2));
	else console.log(human);
}

// Resolve an exam id: explicit arg, else the only seeded exam, else error.
async function resolveExam(explicit?: string): Promise<string> {
	if (explicit) return explicit;
	const exams = await listExams();
	if (exams.length === 1) return exams[0]!.id;
	if (exams.length === 0)
		throw new Error("no exams seeded — run `bun db:seed`");
	throw new Error(
		`multiple exams (${exams.map((e) => e.id).join(", ")}) — specify one`,
	);
}

const HELP = `catac — prep tracker CLI

  exam list                                  list seeded exams
  syllabus [examId]                          print the syllabus tree
  progress set <subtopicId> <status>         set progress
       [--confidence N] [--notes "..."]      status: not_started|learning|practiced|mastered
  progress show [examId]                     list every subtopic + status
  status [examId]                            coverage % overall + per section
  next [examId] [--limit N]                  highest-leverage things to do next
  plan create <examId> --target YYYY-MM-DD   build a dated, weighted study plan
       [--daily N] [--notes "..."]
  plan show [examId]                         show the active plan + days left
  plan adjust <itemId> [--hours N]           tweak one plan item
       [--start YYYY-MM-DD] [--end ..] [--order N]
  plan reweight [examId]                     rebias plan toward weak sections
                                             (from the latest mock)
  mock add <examId> --<sectionId> N ...      log a mock (e.g. --varc 30 --dilr 20)
       [--name ".."] [--date YYYY-MM-DD] [--pct N] [--notes ".."]
  mock list [examId]                         list logged mocks
  review due [examId]                        subtopics due for spaced review
  review done <subtopicId> [--grade 0-5]     grade a review, reschedule it
  pack export <examId> [--out file.json]     export exam content (no progress)
  pack import <file.json>                     import an exam pack into the DB

  --json   machine-readable output on any command`;

async function main() {
	const [group, verb] = pos;

	if (!group || group === "help" || opts.help) {
		console.log(HELP);
		return;
	}

	switch (group) {
		case "exam": {
			if (verb === "list" || verb === undefined) {
				const exams = await listExams();
				out(
					exams.map((e) => `${e.id}\t${e.name} — ${e.fullName}`).join("\n") ||
						"(none)",
					exams,
				);
				return;
			}
			throw new Error(`unknown: exam ${verb}`);
		}

		case "syllabus": {
			const examId = await resolveExam(pos[1]);
			const tree = await getSyllabus(examId);
			const human = tree
				.map(
					(s) =>
						`${s.name} (${s.short})\n` +
						s.topics
							.map(
								(t) =>
									`  ${t.name}${t.weightPct != null ? ` ~${t.weightPct}%` : ""}\n` +
									t.subtopics.map((x) => `    - ${x.id}  ${x.name}`).join("\n"),
							)
							.join("\n"),
				)
				.join("\n\n");
			out(human, tree);
			return;
		}

		case "progress": {
			if (verb === "set") {
				const [, , subtopicId, status] = pos;
				if (!subtopicId || !status)
					throw new Error("usage: progress set <subtopicId> <status>");
				const res = await setProgress({
					subtopicId,
					status,
					confidence:
						opts.confidence !== undefined ? Number(opts.confidence) : undefined,
					notes: typeof opts.notes === "string" ? opts.notes : undefined,
				});
				out(`set ${res.subtopicId} -> ${res.status}`, res);
				return;
			}
			if (verb === "show") {
				const examId = await resolveExam(pos[2]);
				const rows = await getProgressRows(examId);
				out(
					rows
						.map((r) => `${r.status.padEnd(11)} ${r.subtopicId}  ${r.subName}`)
						.join("\n"),
					rows,
				);
				return;
			}
			throw new Error(`unknown: progress ${verb ?? ""}`.trim());
		}

		case "status": {
			const examId = await resolveExam(pos[1]);
			const s = await getStatus(examId);
			const activePlan = await getActivePlan(examId);
			const daysLine = activePlan
				? `\n  ${activePlan.daysRemaining} days to ${activePlan.targetDate}`
				: `\n  (no plan yet — run: catac plan create ${examId} --target YYYY-MM-DD)`;
			const human =
				`${examId}: ${s.coveragePct}% covered (${s.totalSubtopics} subtopics)\n` +
				s.sections.map((x) => `  ${x.section}: ${x.coveragePct}%`).join("\n") +
				`\n  ` +
				Object.entries(s.counts)
					.map(([k, v]) => `${k}=${v}`)
					.join("  ") +
				daysLine;
			out(human, { ...s, daysRemaining: activePlan?.daysRemaining ?? null });
			return;
		}

		case "next": {
			const examId = await resolveExam(pos[1]);
			const limit = opts.limit !== undefined ? Number(opts.limit) : 5;
			const items = await getNext(examId, limit);
			out(
				items
					.map(
						(i) =>
							`[${i.section}] ${i.topic} > ${i.name}  (${i.status})  ${i.subtopicId}`,
					)
					.join("\n") || "all mastered 🎉",
				items,
			);
			return;
		}

		case "plan": {
			if (verb === "create") {
				const examId = pos[2];
				if (!examId)
					throw new Error("usage: plan create <examId> --target YYYY-MM-DD");
				if (typeof opts.target !== "string")
					throw new Error("plan create needs --target YYYY-MM-DD");
				const p = await createPlan({
					examId,
					targetDate: opts.target,
					dailyHours: opts.daily !== undefined ? Number(opts.daily) : undefined,
					notes: typeof opts.notes === "string" ? opts.notes : undefined,
				});
				if (!p) throw new Error("plan creation failed");
				out(planHuman(p), p);
				return;
			}
			if (verb === "show" || verb === undefined) {
				const examId = await resolveExam(pos[2]);
				const p = await getActivePlan(examId);
				if (!p) {
					out(`no active plan for ${examId}`, null);
					return;
				}
				out(planHuman(p), p);
				return;
			}
			if (verb === "adjust") {
				const itemId = Number(pos[2]);
				if (!Number.isInteger(itemId))
					throw new Error(
						"usage: plan adjust <itemId> [--hours N] [--start ..] [--end ..] [--order N]",
					);
				const res = await adjustPlanItem(itemId, {
					allocatedHours:
						opts.hours !== undefined ? Number(opts.hours) : undefined,
					plannedStart: typeof opts.start === "string" ? opts.start : undefined,
					plannedEnd: typeof opts.end === "string" ? opts.end : undefined,
					orderIndex: opts.order !== undefined ? Number(opts.order) : undefined,
				});
				out(`adjusted item ${res.id}`, res);
				return;
			}
			if (verb === "reweight") {
				const examId = await resolveExam(pos[2]);
				const res = await reweightPlanFromMock(examId);
				const head = `reweighted ${examId} from mock "${res.basedOnMock.name}" (weakness ${JSON.stringify(res.weakness)})`;
				out(res.plan ? `${head}\n${planHuman(res.plan)}` : head, res);
				return;
			}
			throw new Error(`unknown: plan ${verb ?? ""}`.trim());
		}

		case "mock": {
			if (verb === "add") {
				const examId = pos[2];
				if (!examId)
					throw new Error("usage: mock add <examId> --<sectionId> N ...");
				const sections = await getSyllabus(examId);
				const sectionScores: Record<string, number> = {};
				for (const s of sections) {
					if (opts[s.id] !== undefined)
						sectionScores[s.id] = Number(opts[s.id]);
				}
				if (Object.keys(sectionScores).length === 0)
					throw new Error(
						`provide section scores, e.g. ${sections.map((s) => `--${s.id} N`).join(" ") || "--<sectionId> N"}`,
					);
				const res = await logMock({
					examId,
					name: typeof opts.name === "string" ? opts.name : undefined,
					date: typeof opts.date === "string" ? opts.date : undefined,
					sectionScores,
					estPercentile: opts.pct !== undefined ? Number(opts.pct) : undefined,
					notes: typeof opts.notes === "string" ? opts.notes : undefined,
				});
				out(
					`logged mock #${res.id} "${res.name}" (${res.date}) total ${res.total}  ${JSON.stringify(res.sectionScores)}`,
					res,
				);
				return;
			}
			if (verb === "list" || verb === undefined) {
				const examId = await resolveExam(pos[2]);
				const mocks = await listMocks(examId);
				out(
					mocks
						.map(
							(m) =>
								`#${m.id}  ${m.date}  ${m.name}  total=${m.total}  ${JSON.stringify(m.sectionScoresJson)}`,
						)
						.join("\n") || "(no mocks)",
					mocks,
				);
				return;
			}
			throw new Error(`unknown: mock ${verb ?? ""}`.trim());
		}

		case "review": {
			if (verb === "due" || verb === undefined) {
				const examId = await resolveExam(pos[2]);
				const due = await getDueReviews(examId);
				out(
					due
						.map(
							(d) =>
								`due ${d.dueDate}  [${d.section}] ${d.topic} > ${d.subName}  ${d.subtopicId}`,
						)
						.join("\n") || "nothing due 🎉",
					due,
				);
				return;
			}
			if (verb === "done") {
				const subtopicId = pos[2];
				if (!subtopicId)
					throw new Error("usage: review done <subtopicId> [--grade 0-5]");
				const grade = opts.grade !== undefined ? Number(opts.grade) : 4;
				const res = await reviewDone(subtopicId, grade);
				out(
					`review ${res.subtopicId}: next in ${res.intervalDays}d (due ${res.dueDate}, ease ${res.ease})`,
					res,
				);
				return;
			}
			throw new Error(`unknown: review ${verb ?? ""}`.trim());
		}

		case "pack": {
			if (verb === "export") {
				const examId = pos[2];
				if (!examId)
					throw new Error("usage: pack export <examId> [--out file.json]");
				const pack = await exportExamContent(examId);
				const outPath =
					typeof opts.out === "string" ? opts.out : `${examId}-pack.json`;
				writeFileSync(outPath, JSON.stringify(pack, null, 2));
				out(
					`exported ${examId} -> ${outPath} (${pack.sections?.length ?? 0} sections)`,
					{ path: outPath, pack },
				);
				return;
			}
			if (verb === "import") {
				const file = pos[2];
				if (!file) throw new Error("usage: pack import <file.json>");
				const pack = JSON.parse(readFileSync(file, "utf8")) as ExamPack;
				const s = await importExamContent(pack);
				out(
					`imported ${pack.id}: ${s.sectionCount} sections, ${s.topicCount} topics, ${s.subtopicCount} subtopics, ${s.resourceCount} resources`,
					{ examId: pack.id, ...s },
				);
				return;
			}
			throw new Error(`unknown: pack ${verb ?? ""}`.trim());
		}

		default:
			throw new Error(`unknown command: ${group}`);
	}
}

function planHuman(p: {
	examId: string;
	targetDate: string;
	daysRemaining: number;
	totalAllocatedHours: number;
	items: {
		id: number;
		topicName: string | null;
		allocatedHours: number | null;
		plannedStart: string | null;
		plannedEnd: string | null;
	}[];
}): string {
	const head = `plan for ${p.examId}: ${p.daysRemaining} days to ${p.targetDate}, ${p.totalAllocatedHours}h total`;
	const lines = p.items.map(
		(i) =>
			`  #${i.id}  ${i.plannedStart}→${i.plannedEnd}  ${String(i.allocatedHours ?? 0).padStart(5)}h  ${i.topicName ?? i.id}`,
	);
	return [head, ...lines].join("\n");
}

main()
	.then(() => process.exit(0))
	.catch((err: Error) => {
		if (asJson) {
			console.log(
				JSON.stringify({ error: err.message, name: err.name }, null, 2),
			);
		} else {
			console.error(`error: ${err.message}`);
		}
		process.exit(1);
	});
