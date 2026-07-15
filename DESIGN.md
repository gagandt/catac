# CAT / MBA Prep Tracker — Design Doc (v3)

> Local-first, Claude-driven, multi-exam prep **tracker** (not a content host).
> Revised after CEO review. Supersedes the v2 "app-first" design.

## What this is

A personal prep-tracking system with **three surfaces over one local DB**:

```
   You  <->  Claude Code (skills)  ─┐
                                    ├─>  CORE (domain logic)  ─>  local SQLite
   You  <->  Web UI (T3 / tRPC)  ───┘        (single source of behavior)
```

- **Claude** plans and mutates (day-one: "I have 4 months, plan my prep").
- **UI** reflects state and lets you tweak any syllabus item or allocation.
- **DB** (local SQLite) is the single source of truth.
- **Transferable**: clone the repo, seed, talk to your own Claude. Your progress
  never ships — only the code, skills, and content seed.
- **Multi-exam, open-ended**: add exams as content + optional skills.
- **Tracking only**: we don't host lessons. We track progress against a syllabus and guide.

## Core decision (locked)

**Shared core + CLI.** One typed domain layer owns all logic and every derived
number. It is exposed **twice**:

- **tRPC routers** → the web UI.
- **`catac` CLI** → Claude skills call it via Bash.

Consequences: UI and Claude can never disagree (one code path). Skills are thin
wrappers over CLI verbs. The README is an index of those verbs — so a fresh Claude
reads README + `catac --help` and understands the entire surface. This is what makes
the system "reverse-engineerable" and "backward-compatible with the UI."

## Local-first (not hosted)

"Installed Claude + local DB + transferable" ⇒ runs on your machine. `bun dev` for
the UI, Claude Code in the same repo for the chat layer, both hitting `./db.sqlite`.
No Vercel/serverless for v1 (serverless can't hold a writable local SQLite that Claude
also reaches). Hosting is a later, separate decision.

## Data model

Two categories, one DB file. **Content is seeded and shipped; state is per-user and
starts empty.** Both keyed by stable string IDs so content edits don't orphan progress.

### Content (seeded from versioned source, read-only to the app)

- **exam** — `id` (`cat`), `name`, `fullName`, `metaJson` (site, default exam date, fee, eligibility…).
- **section** — `id`, `examId`, `name`, `short`, `questions`, `marks`, `timeMinutes`, `orderIndex`.
- **topic** — `id`, `sectionId`, `name`, `weightPct`, `priority`, `orderIndex`.
- **subtopic** — `id`, `topicId`, `name`, `orderIndex`.
- **resource** — `id`, `examId`, `kind`, `name`, `detail`, `url`.
- **exam_scoring** — `id`, `examId`, `kind` (`percentile_bands` | `gmat_scaled` | …),
  `dataJson`. **Flexible per-exam scoring** — a rigid percentile table breaks on GMAT
  (205–805 adaptive) and XAT (decision-making/essay/GK). An adapter reads `kind`.

### State (per-user, starts empty; `db.sqlite` is gitignored)

- **user_pref** — `key`, `value`. Home for "preferences saved to Claude"
  (targetExamId, dailyHours, studyDays, focusBias). In the DB so the **UI can read/edit
  them too**, not trapped in Claude memory.
- **plan** — `id`, `examId`, `targetDate`, `status`, `notes`, `createdAt`. The
  personalized, editable schedule. This is what "I have 4 months, plan accordingly" produces.
- **plan_item** — `id`, `planId`, `subtopicId` (or `topicId`), `plannedStart`,
  `plannedEnd`, `allocatedHours`, `orderIndex`. Editable per-item allocation.
- **progress** — `id`, `subtopicId`, `status` (not_started | learning | practiced |
  mastered), `confidence` (1–5), `notes`, `updatedAt`.
- **mock_attempt** — `id`, `examId`, `name`, `date`, `sectionScoresJson`, `total`,
  `estPercentile`, `analysisNotes`.
- **study_session** — `id`, `date`, `sectionId`, `minutes`, `whatDone`.

### Derived (computed in core, never stored as truth)

- `daysRemaining(plan)` = `targetDate − today`.
- `coverage(examId)` = weighted % over `topic.weightPct` of practiced/mastered.
- `whatNext(planId)` = next `plan_item`s by order where progress < target, re-ranked by days left.
- `onTrack(planId)` = planned pace vs actual pace.

Computed in ONE place so Claude and the UI report identical numbers.

## Skills / CLI surface (the product spine)

`catac` verbs (core fns; tRPC and CLI both call them):

```
catac exam list | add <slug> | use <slug>
catac plan create --exam cat --target 2026-11-29
catac plan show | adjust <planItemId> --hours N --status ...
catac progress set <subtopicId> <status> [--confidence N]
catac next                 # what to do next
catac status               # % done, days left, on-track
catac mock add ... | list
catac pref set|get <key> [value]
```

Claude skills (`.claude/skills/`), thin wrappers over the CLI:

- **/plan-exam** — the day-one conversation → builds a `plan` + `plan_item`s.
- **/whats-next** — `catac next` + coaching.
- **/log-progress** — `catac progress set`.
- **/adjust-plan** — re-allocate time across items.
- **/status** — `catac status`.
- **/add-exam** — runs the research pipeline → writes a content seed. This is the
  "robust research capability" codified as a repeatable skill (CAT was done manually once;
  this makes exam #2+ one command).

**README** = generated index of these skills + CLI verbs. Requirement #1 met.

## Transfer / seed flow

1. Content authored as versioned files (`content/<exam>.json`, promoted from
   `research/data/cat.json`).
2. `bun db:seed` upserts content idempotently on stable IDs. Progress survives re-seeds.
3. `db.sqlite` is gitignored — personal state never travels.
4. Recipient: `git clone` → `bun install` → `bun db:push && bun db:seed` → talk to
   Claude → `/plan-exam`. Fresh syllabus, empty progress.

## Failure modes (must be handled, not hoped away)

- **SQLite lock** (Claude + UI write concurrently) → enable **WAL**; core wraps writes
  in short transactions; CLI processes are short-lived.
- **Claude passes an unknown subtopic id** → CLI validates against content, returns a
  named `UnknownSubtopicError`; Claude self-corrects instead of writing garbage.
- **Plan target in the past / 0 days** → validation error surfaced, not silently planned.
- **No plan yet** → `catac next` returns "no plan — run /plan-exam", never crashes.
- **Content updated after user started** → idempotent upsert on stable IDs; progress
  keyed by subtopic id is preserved.
- **Non-CAT scoring** → `exam_scoring` adapter, not fixed columns.

## Accepted expansions (in scope)

All four folded onto the baseline. Schema + CLI additions:

1. **Adaptive re-planning** — logging a mock re-weights the plan toward weak sections;
   Claude proposes the shift. Needs `mock_attempt → plan` link + `catac plan reweight
   --from-mock <id>`. `/log-progress` and mock logging trigger a proposal, user confirms.
2. **Spaced-repetition review** — new **review_item** (`id`, `subtopicId`, `dueDate`,
   `intervalDays`, `ease`); SM-2-style scheduler in core; `catac review due` + `/whats-next`
   mixes due reviews into the plan.
3. **Progress history + trend** — new **snapshot** (`id`, `examId`, `date`, `coveragePct`,
   `metricsJson`); core writes a daily snapshot on progress/mock change; dashboard renders a
   trajectory line. `catac status` shows delta vs last week.
4. **Shareable exam packs** — a "pack" = content seed (+ optional plan template), no personal
   progress. `catac pack export <exam>` / `catac pack import <file>`. Extends "transferable"
   beyond cloning the repo.

## Build order

1. **Schema + core** — replace example `posts` with content+state tables + `review_item` +
   `snapshot`; WAL; migrations.
2. **Seed** — promote `cat.json` → `content/cat.json` + `db:seed`; gitignore `db.sqlite`.
3. **CLI** — `catac` over core fns, with `--help` and validation (incl. `review`, `pack`,
   `plan reweight`).
4. **Skills + README** — `.claude/skills/*` over the CLI; generate README index.
5. **tRPC + UI** — exam picker → syllabus tracker (tap status) → dashboard (days left,
   % done, what-next, **trend line**) → editable plan view → mocks.
6. **Adaptive re-planning + spaced repetition** — wire mock→reweight and `review_item` into
   `/whats-next`.
7. **/add-exam + pack export/import** — codify the research pipeline; enable sharing.

## Status

- ✅ CEO review done; architecture locked (shared core + CLI, local-first).
- ✅ T3 + Drizzle + libSQL scaffolded (local SQLite).
- ⬜ Everything in Build order above. Skills layer + plan model + seed are the critical path.

## Requirements traceability

| Your requirement | Satisfied by |
|------------------|--------------|
| 1. Reverse-engineerable via Claude; README of skills; UI-compatible | Shared core + CLI; README indexes CLI verbs; both surfaces call one core |
| 2. Local DB accessible by code | Local SQLite via Drizzle core; tRPC + CLI both read/write it |
| 3. Easy to add skills; open-ended; multi-exam | Skills = thin CLI wrappers; `exam`-scoped content + `/add-exam`; scoring adapter |
| 4. Tracking, not content | Content = syllabus skeleton only (seeded); no lessons hosted |
