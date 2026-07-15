# catac — MBA-entrance prep tracker

A **local-first, Claude-driven** progress tracker for MBA-entrance exams (CAT first;
XAT / GMAT / NMAT / SNAP are just more content). It tracks *progress against a syllabus* —
it is **not** a content host. You drive it two ways over one local database:

```
   You  <->  Claude Code (skills)  ─┐
                                    ├─>  CORE (src/server/core)  ─>  local SQLite
   You  <->  Web UI (T3 / tRPC)  ───┘        (one source of behavior)
```

Both surfaces call the **same core**, so Claude and the UI can never report different
numbers. The `catac` CLI is a thin wrapper over the core; the web UI is a thin tRPC
wrapper over the same core. This README + `catac --help` are enough for a fresh Claude
to reverse-engineer the whole system.

## Quickstart

```bash
bun run setup        # .env + deps + build local db   (or: bun install)
bun run db:push      # create tables in ./db.sqlite
bun run db:seed      # load content from content/*.json  (idempotent)
bun run dev          # web UI at http://localhost:3000
```

`db.sqlite` is **gitignored** — your progress never ships. Content lives in `content/`
and in git; personal state (plans, progress, mocks) lives only in your local DB.

## The `catac` CLI (what Claude drives)

```bash
bun run catac exam list                                   # seeded exams
bun run catac syllabus <examId>                           # full syllabus tree
bun run catac status  <examId>                            # coverage % + days left
bun run catac next    <examId> [--limit N]                # highest-leverage next topics
bun run catac progress set <subtopicId> <status> [--confidence N] [--notes ".."]
bun run catac progress show <examId>
bun run catac plan create <examId> --target YYYY-MM-DD [--daily N] [--notes ".."]
bun run catac plan show   <examId>
bun run catac plan adjust <itemId> [--hours N] [--start ..] [--end ..] [--order N]
bun run catac plan reweight <examId>                      # rebias toward weak sections
bun run catac mock add <examId> --varc 30 --dilr 20 --qa 25 [--name ..] [--pct N]
bun run catac mock list <examId>
bun run catac review due <examId>                         # spaced-repetition queue
bun run catac review done <subtopicId> [--grade 0-5]
bun run catac pack export <examId> [--out file.json]      # share an exam (no progress)
bun run catac pack import <file.json>
```

- `status` values: `not_started | learning | practiced | mastered`.
- Add `--json` to any command for machine-readable output (skills use this).
- Bad input → exit code 1 + a named error (`--json` prints `{"error","name"}`), so Claude
  self-corrects instead of writing garbage.

## Skills (talk to Claude, see it in the UI)

Project skills live in `.claude/skills/`. Each is a thin recipe over the CLI:

| Skill | Use it for |
|-------|------------|
| **/plan-exam** | Day one: "I have 4 months for CAT" → a dated, weighted plan |
| **/whats-next** | "What should I do next / where am I?" — status, due reviews, top actions |
| **/log-progress** | "Done with percentages" → records progress on a subtopic |
| **/adjust-plan** | More/less time, fell behind, moved exam date → replan or tweak |
| **/add-exam** | "Add GMAT" → researches a new exam, writes a content pack, seeds it |

Everything a skill writes is immediately visible in the web UI (same DB, same core).
Add your own skill by writing a new `.claude/skills/<name>/SKILL.md` that calls `catac` verbs.

## Data model (Drizzle, `src/server/db/schema.ts`)

- **Content** (seeded, shipped): `exam → section → topic → subtopic`, plus `resource`,
  `exam_scoring` (per-exam scoring is a flexible `kind` + `dataJson`, so GMAT/XAT fit).
- **State** (per-user, local only): `user_pref`, `plan → plan_item`, `progress`,
  `mock_attempt`, `study_session`, `review_item` (spaced repetition), `snapshot` (trend).
- Everything keyed by **stable string ids** so re-seeding content never orphans progress.

## Add another exam

Easiest: run the **/add-exam** skill in Claude ("add GMAT") — it researches the exam,
writes `content/<slug>.json`, and seeds it. Or do it by hand:

1. Author `content/<exam>.json` (same shape as `content/cat.json`) — syllabus tree,
   resources, scoring. `marks` per section matters (the planner weights time by it).
2. `bun run db:seed <exam>` to load it (or `bun run catac pack import <file>`).
3. It shows up in `catac exam list`, the web picker, and every skill.

## Transfer to someone else

Clone the repo → `bun install` → `bun run db:push && bun run db:seed` → talk to Claude
(`/plan-exam`). They get the syllabus and skills with an empty progress slate; your
`db.sqlite` stays on your machine.

## Stack

Next.js (App Router) · tRPC · Drizzle ORM · libSQL/SQLite (local) · Tailwind · Bun.
See [DESIGN.md](./DESIGN.md) for the full architecture and roadmap.
