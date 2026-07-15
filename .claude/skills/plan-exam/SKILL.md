---
name: plan-exam
description: Day-one study planning for an exam. Use when the user wants to plan their prep, says "I have N months for CAT", sets a target date, or starts a fresh plan. Gathers the target exam date + daily study hours, then generates a dated, weighted study plan via the catac CLI.
---

You build the user's study plan by driving the `catac` CLI. NEVER write to the DB
directly — always go through `bun run catac`, which owns validation and the logic
the web UI also uses (so the UI and you never disagree).

## Steps

1. **Identify the exam.** `bun run catac exam list --json`. If more than one and the
   user didn't say which, ask. If they named one ("CAT"), use its id (lowercase, e.g. `cat`).

2. **Gather two inputs** (ask only for what's missing from the conversation):
   - **Target exam date** (`YYYY-MM-DD`). If they say "CAT 2026" and the exam meta carries
     a default date, offer it and confirm.
   - **Daily study hours** (default 3 if they don't care; working professionals ~2, full-time ~5).

3. **Create the plan:**
   ```
   bun run catac plan create <examId> --target <YYYY-MM-DD> --daily <N> --json
   ```

4. **Show it back** as a readable table: topic, date window, hours. Lead with days-remaining
   and total hours. Point out the weighting (heaviest topics get the most time).

5. **Offer to adjust** any item:
   `bun run catac plan adjust <itemId> --hours <N>` (also `--start` / `--end` / `--order`).

## Notes

- The plan auto-allocates hours: section share by exam marks, within-section by topic weight,
  laid out as consecutive dated windows in syllabus order.
- Creating a new plan **archives** the previous active one (non-destructive; history kept).
- On bad input the CLI exits non-zero and (with `--json`) prints `{"error","name"}`. Read it
  and fix: `InvalidDateError` → ask for a valid future `YYYY-MM-DD`; `ExamNotFoundError` →
  re-run `exam list` and use a real id.
- After planning, suggest `/whats-next` to start studying.
