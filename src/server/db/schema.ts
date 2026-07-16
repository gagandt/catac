// catac domain schema — a local-first, Claude-driven MBA-entrance prep tracker.
//
//   CONTENT (seeded, shipped, read-only to the app):
//     exam -> section -> topic -> subtopic, plus resource, exam_scoring
//   STATE (per-user, starts empty, db.sqlite is gitignored):
//     user_pref, plan -> plan_item, progress, mock_attempt, study_session,
//     review_item (spaced repetition), snapshot (progress trend)
//
// Everything is keyed by STABLE string ids so re-seeding content never orphans
// progress. All tables are prefixed `catac_` via createTable.

import { sql } from "drizzle-orm";
import { index, sqliteTableCreator, unique } from "drizzle-orm/sqlite-core";

export const createTable = sqliteTableCreator((name) => `catac_${name}`);

// One item in a subtopic's revision checklist (stored as JSON on `progress`).
export type TodoItem = { id: string; text: string; done: boolean };

// ---------------------------------------------------------------------------
// CONTENT
// ---------------------------------------------------------------------------

export const exam = createTable("exam", (d) => ({
	id: d.text().primaryKey(), // "cat", "xat", "gmat"
	name: d.text({ length: 64 }).notNull(),
	fullName: d.text({ length: 256 }).notNull(),
	// site, default exam date, fee, eligibility, pattern summary — flexible blob.
	metaJson: d.text({ mode: "json" }).$type<Record<string, unknown>>(),
}));

export const section = createTable(
	"section",
	(d) => ({
		id: d.text().primaryKey(), // "varc", "dilr", "qa"
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		name: d.text({ length: 128 }).notNull(),
		short: d.text({ length: 16 }).notNull(),
		questions: d.integer({ mode: "number" }),
		marks: d.integer({ mode: "number" }),
		timeMinutes: d.integer({ mode: "number" }),
		orderIndex: d.integer({ mode: "number" }).notNull().default(0),
	}),
	(t) => [index("section_exam_idx").on(t.examId)],
);

export const topic = createTable(
	"topic",
	(d) => ({
		id: d.text().primaryKey(), // "qa-arithmetic"
		sectionId: d
			.text()
			.notNull()
			.references(() => section.id),
		name: d.text({ length: 128 }).notNull(),
		weightPct: d.real(),
		priority: d.text({ length: 16 }), // highest | high | medium | low
		orderIndex: d.integer({ mode: "number" }).notNull().default(0),
	}),
	(t) => [index("topic_section_idx").on(t.sectionId)],
);

// One practice question. Lives inside the subtopic's material blob (no separate
// table) — so a whole Q bank rides along in the shareable pack and seeds for free.
export type PracticeQuestion = {
	q: string; // the question stem
	options?: string[]; // MCQ choices; omit for TITA / type-in
	answer: string; // correct option text or value
	solution?: string; // worked reasoning to the answer
	difficulty?: "easy" | "medium" | "hard";
};

// Actual study material for one subtopic — the "real content", not just a name.
// Shipped inside the exam pack, seeded read-only, rendered in the UI detail modal.
// Every field optional so a pack can carry as much or as little as it has.
export type SubtopicMaterial = {
	frequency?: "high" | "medium" | "low" | "rare"; // how often CAT tests it
	summary?: string; // 1-3 sentences: what it is / why it matters
	formulas?: string[]; // key formulas & standard results
	keyIdeas?: string[]; // must-know points, shortcuts, intuition
	example?: { q: string; solution: string }; // one worked example
	traps?: string[]; // common mistakes / exam gotchas
	practice?: PracticeQuestion[]; // practice bank (stored in-blob, no table)
};

export const subtopic = createTable(
	"subtopic",
	(d) => ({
		id: d.text().primaryKey(), // "qa-arithmetic-s1"
		topicId: d
			.text()
			.notNull()
			.references(() => topic.id),
		name: d.text({ length: 512 }).notNull(),
		// Study material blob (concept, formulas, example, traps). Null = name only.
		materialJson: d.text({ mode: "json" }).$type<SubtopicMaterial>(),
		orderIndex: d.integer({ mode: "number" }).notNull().default(0),
	}),
	(t) => [index("subtopic_topic_idx").on(t.topicId)],
);

export const resource = createTable(
	"resource",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		kind: d.text({ length: 32 }).notNull(), // youtube | mock | reading | community
		name: d.text({ length: 256 }).notNull(),
		detail: d.text(),
		url: d.text(),
	}),
	(t) => [index("resource_exam_idx").on(t.examId)],
);

// Per-exam scoring is NOT a fixed shape — CAT is percentile bands, GMAT is a
// 205-805 scaled score, XAT adds decision-making/essay. Store the model kind +
// its data; a core adapter interprets it.
export const examScoring = createTable(
	"exam_scoring",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		kind: d.text({ length: 48 }).notNull(), // percentile_bands | gmat_scaled | ...
		dataJson: d.text({ mode: "json" }).$type<unknown>().notNull(),
	}),
	(t) => [index("exam_scoring_exam_idx").on(t.examId)],
);

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

// "Preferences saved to Claude" live here so the UI can read/edit them too.
export const userPref = createTable("user_pref", (d) => ({
	key: d.text().primaryKey(), // targetExamId, dailyHours, studyDays, focusBias
	value: d.text({ mode: "json" }).$type<unknown>(),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

// The personalized, editable schedule produced by "I have 4 months, plan it".
export const plan = createTable(
	"plan",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		targetDate: d.text({ length: 10 }).notNull(), // ISO "YYYY-MM-DD"
		status: d.text({ length: 16 }).notNull().default("active"), // active | archived
		notes: d.text(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [index("plan_exam_idx").on(t.examId)],
);

export const planItem = createTable(
	"plan_item",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		planId: d
			.integer({ mode: "number" })
			.notNull()
			.references(() => plan.id),
		// What this item is: a study block or a mock test.
		kind: d.text({ length: 8 }).notNull().default("study"), // study | mock
		// For kind="mock": which tier of mock this is (maps to syllabus depth).
		//   vision  = topic-level mini-mock  (topicId set)
		//   subject = section-level mock      (sectionId set)
		//   global  = full-length, all-sections
		mockTier: d.text({ length: 8 }), // vision | subject | global | null
		// Either a whole topic or a specific subtopic can be scheduled. A subject
		// mock scopes to a section; a global mock scopes to nothing (title only).
		topicId: d.text().references(() => topic.id),
		subtopicId: d.text().references(() => subtopic.id),
		sectionId: d.text().references(() => section.id),
		// Human label — required for mock items (which carry no topic name).
		title: d.text({ length: 256 }),
		plannedStart: d.text({ length: 10 }), // ISO date
		plannedEnd: d.text({ length: 10 }),
		allocatedHours: d.real(),
		// User-set emphasis, surfaced on the board. normal | high.
		priority: d.text({ length: 8 }).notNull().default("normal"),
		orderIndex: d.integer({ mode: "number" }).notNull().default(0),
	}),
	(t) => [index("plan_item_plan_idx").on(t.planId)],
);

// One row per subtopic (subtopicId is the PK) — upsert on progress change.
export const progress = createTable("progress", (d) => ({
	subtopicId: d
		.text()
		.primaryKey()
		.references(() => subtopic.id),
	status: d.text({ length: 16 }).notNull().default("not_started"), // not_started | learning | practiced | mastered
	confidence: d.integer({ mode: "number" }), // 1-5
	notes: d.text(),
	// Count of practice questions the user has done for this subtopic.
	questionsDone: d.integer({ mode: "number" }).notNull().default(0),
	// Per-subtopic revision checklist: [{ id, text, done }].
	todos: d.text({ mode: "json" }).$type<TodoItem[]>(),
	updatedAt: d
		.integer({ mode: "timestamp" })
		.$onUpdate(() => new Date())
		.default(sql`(unixepoch())`)
		.notNull(),
}));

export const mockAttempt = createTable(
	"mock_attempt",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		name: d.text({ length: 128 }).notNull(),
		date: d.text({ length: 10 }).notNull(), // ISO date
		sectionScoresJson: d.text({ mode: "json" }).$type<Record<string, number>>(),
		total: d.real(),
		estPercentile: d.real(),
		analysisNotes: d.text(),
	}),
	(t) => [index("mock_exam_idx").on(t.examId)],
);

export const studySession = createTable(
	"study_session",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		date: d.text({ length: 10 }).notNull(),
		sectionId: d.text().references(() => section.id),
		minutes: d.integer({ mode: "number" }).notNull(),
		whatDone: d.text(),
	}),
	(t) => [index("study_session_date_idx").on(t.date)],
);

// Spaced-repetition schedule (SM-2-ish). One active schedule per subtopic.
export const reviewItem = createTable(
	"review_item",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		subtopicId: d
			.text()
			.notNull()
			.references(() => subtopic.id),
		dueDate: d.text({ length: 10 }).notNull(), // ISO date
		intervalDays: d.integer({ mode: "number" }).notNull().default(1),
		ease: d.real().notNull().default(2.5),
	}),
	(t) => [unique("review_item_subtopic_uq").on(t.subtopicId)],
);

// Daily trend snapshot — powers the dashboard trajectory line.
export const snapshot = createTable(
	"snapshot",
	(d) => ({
		id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
		examId: d
			.text()
			.notNull()
			.references(() => exam.id),
		date: d.text({ length: 10 }).notNull(), // ISO date
		coveragePct: d.real(),
		metricsJson: d.text({ mode: "json" }).$type<Record<string, unknown>>(),
	}),
	(t) => [unique("snapshot_exam_date_uq").on(t.examId, t.date)],
);
