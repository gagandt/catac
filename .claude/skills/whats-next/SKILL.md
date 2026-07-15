---
name: whats-next
description: Tell the user what to study next and where they stand. Use when they ask "what should I do next", "what now", "where am I", "how am I doing", or want their current coverage and remaining time.
---

Report status and the highest-leverage next actions by reading the `catac` CLI.

## Steps

1. **Resolve the exam id** (`bun run catac exam list --json`; ask if ambiguous).

2. **Status:** `bun run catac status <examId> --json`
   → overall coverage %, per-section %, status histogram, `daysRemaining` (null if no plan).

3. **Due reviews (do these first):** `bun run catac review due <examId> --json`
   → subtopics whose spaced-repetition review is due. Retention before new material.
   The user grades each with `bun run catac review done <subtopicId> --grade 0-5`.

4. **Next actions:** `bun run catac next <examId> --limit 5 --json`
   → the top unfinished subtopics, ranked by topic weight then least-done. Each has a
   `subtopicId` the user (or `/log-progress`) can act on.

## Present

- One status line first: `coverage% covered · N days to <exam> · R reviews due`
  (or "no plan yet — offer /plan-exam").
- If reviews are due, lead with them ("revise these first"), then the new-material list.
- Then the top 3-5 next items as a short list: `[SECTION] Topic > Subtopic`.
- Add judgment: if `daysRemaining` is small and a heavy section (high per-section weight,
  low coverage) is untouched, call it out. If a section is near 0% and it enforces a
  sectional cutoff (e.g. CAT VARC), flag the risk.
- If there's no active plan, suggest `/plan-exam` before diving in.
