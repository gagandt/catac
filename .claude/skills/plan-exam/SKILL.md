---
name: plan-exam
description: Day-one study planning for an exam. Use when the user wants to plan their prep, says "I have N months for CAT", sets a target date, or starts a fresh plan. Asks how many hours a day they can give and their target exam date up front, then builds a dated, weighted plan — study blocks PLUS mocks (vision / subject / full-length) — that they can drag around on the plan page.
---

You build the user's study plan by driving the `catac` CLI. NEVER write to the DB
directly — always go through `bun run catac`, which owns validation and the logic
the web UI also uses (so the UI and you never disagree). The plan is **saved to the
database**; the user views and rearranges it at `/exam/<examId>/plan`.

## Steps

1. **Identify the exam.** `bun run catac exam list --json`. If more than one and the
   user didn't say which, ask. If they named one ("CAT"), use its id (lowercase, e.g. `cat`).

2. **Ask the two inputs — lead with hours.** This is the first thing to nail down:
   - **How many hours a day can you study?** Ask this explicitly, up front, before
     anything else. Guide them: working professional ~2, part-time ~3, full-time ~5.
     Default 3 only if they truly don't care. This number drives the whole allocation.
   - **Target exam date** (`YYYY-MM-DD`). If they say "CAT 2026" and the exam meta carries
     a default date, offer it and confirm.

3. **Create the plan:**
   ```
   bun run catac plan create <examId> --target <YYYY-MM-DD> --daily <N> --json
   ```
   This lays out dated study windows **at the subtopic level** (one node per subtopic, so
   the user can see and order exactly which subtopic to start when — time split within a
   topic by each subtopic's exam frequency) **and automatically weaves in the three tiers
   of mocks** (see below). Add `--by topic` for coarser topic-level nodes instead.
   Creating a new plan archives the previous active one (non-destructive; history kept).

4. **Show it back** as a readable summary: lead with days-remaining and total hours,
   then the shape — heaviest topics get the most time, a vision mock after each
   section's key topic, a sectional mock when each section wraps, and full-length mocks
   ramping up weekly through the back half to exam day.

5. **Point them at the board.** Tell them to open **`/exam/<examId>/plan`** to see it,
   switch between **daily / weekly / monthly** views, **drag** items to reorder or move
   them between days/weeks/months, **star** anything high-priority, and add or remove
   nodes by hand. All edits persist to the same DB.

## Mocks — always in the plan

Every plan includes three mock tiers, mapped to syllabus depth:

- **vision** — a topic-level mini-mock, placed when a section's heaviest topic wraps up
  (a quick check you actually learned it).
- **subject** — a section-level (sectional) mock, placed the day a whole section's study
  finishes.
- **global** — full-length, all-section mocks, weekly from ~55% of the runway to exam day.

Never describe a plan as mock-free. If the user wants more/fewer or different timing,
adjust with the CLI (below) or tell them to drag them on the board.

## Adjusting (CLI mirrors the board)

- `bun run catac plan show <examId>` — print the active plan (study + mocks, priority ★).
- `bun run catac plan move <itemId> <YYYY-MM-DD>` — move an item to a new start date.
- `bun run catac plan priority <itemId> <high|normal>` — flag/unflag priority.
- `bun run catac plan add <examId> --kind study|mock [--topic id] [--tier vision|subject|global] [--title ".."] [--start YYYY-MM-DD] [--hours N] [--priority high]` — add a node.
- `bun run catac plan remove <itemId>` — delete a node.
- `bun run catac plan adjust <itemId> [--hours N] [--start ..] [--end ..] [--order N]` — tweak one item.
- `bun run catac plan reweight <examId>` — rebias study time toward weak sections from the latest mock.

## Notes

- Allocation: section share by exam marks, within-section by topic weight, laid as
  consecutive dated windows in syllabus order; mocks layered on top.
- On bad input the CLI exits non-zero and (with `--json`) prints `{"error","name"}`. Read it
  and fix: `InvalidDateError` → ask for a valid future `YYYY-MM-DD`; `ExamNotFoundError` →
  re-run `exam list` and use a real id.
- After planning, suggest `/whats-next` to start studying.
