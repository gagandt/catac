---
name: adjust-plan
description: Change an existing study plan — reallocate hours, shift dates, reprioritize, or replan from scratch. Use when the user says they have more/less time, want to spend more on a section, fell behind, or moved their exam date.
---

Modify the active plan through the `catac` CLI.

## Steps

1. **Show the current plan:** `bun run catac plan show <examId> --json`
   → items with their `id`, `allocatedHours`, `plannedStart`/`plannedEnd`, `orderIndex`.

2. **Small tweak** (one item): use its `id`:
   ```
   bun run catac plan adjust <itemId> --hours <N>
   bun run catac plan adjust <itemId> --start <YYYY-MM-DD> --end <YYYY-MM-DD>
   bun run catac plan adjust <itemId> --order <N>
   ```
   Note: adjusting one item does NOT auto-shift the others' dates — fix neighbors if needed,
   or replan.

3. **Full replan** (exam date changed, or hours/day changed): recreate — this archives the
   old plan and re-allocates from today across the remaining days:
   ```
   bun run catac plan create <examId> --target <YYYY-MM-DD> --daily <N>
   ```

4. **Show the updated plan** and summarize what changed.

## Judgment

- Fell behind? Prefer a **full replan** so the remaining days get re-weighted, rather than
  hand-patching every window.
- Wants to prioritize a weak section? Bump those items' hours and lower others, or replan
  after telling the user their coverage gaps (`/whats-next`).
