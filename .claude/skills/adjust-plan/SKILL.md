---
name: adjust-plan
description: Change an existing study plan — reallocate hours, shift dates, reprioritize, or replan from scratch. Use when the user says they have more/less time, want to spend more on a section, fell behind, or moved their exam date.
---

Modify the active plan through the `catac` CLI. Plan items include both **study
blocks** and **mocks** (vision / subject / global). The user can also drag items,
reorder, star priorities, and switch daily/weekly/monthly views at `/exam/<examId>/plan`
— the CLI writes the same DB, so your edits and their drags stay in sync.

## Steps

1. **Show the current plan:** `bun run catac plan show <examId> --json`
   → items with `id`, `kind` (study|mock), `mockTier`, `title`, `allocatedHours`,
   `plannedStart`/`plannedEnd`, `priority`, `orderIndex`.

2. **Small tweaks** (one item): use its `id`:
   ```
   bun run catac plan adjust <itemId> --hours <N>            # reallocate hours
   bun run catac plan move <itemId> <YYYY-MM-DD>             # move to a new start (keeps duration)
   bun run catac plan adjust <itemId> --start .. --end ..    # set an explicit window
   bun run catac plan priority <itemId> <high|normal>        # (de)prioritize
   bun run catac plan add <examId> --kind study|mock ...     # add a study topic or a mock
   bun run catac plan remove <itemId>                        # delete a node
   ```
   Note: adjusting/moving one item does NOT auto-shift the others' dates — fix neighbors
   if needed, or replan.

3. **Full replan** (exam date changed, or hours/day changed): recreate — this archives the
   old plan and re-allocates from today across the remaining days, mocks included:
   ```
   bun run catac plan create <examId> --target <YYYY-MM-DD> --daily <N>
   ```

4. **Show the updated plan** and summarize what changed. If they'd rather rearrange by
   hand, point them at the plan board (`/exam/<examId>/plan`).

## Judgment

- Fell behind? Prefer a **full replan** so the remaining days get re-weighted, rather than
  hand-patching every window.
- Wants to prioritize a weak section? Bump those items' hours and lower others (or star
  them), or replan after telling the user their coverage gaps (`/whats-next`).
- More/fewer mocks or different timing? `plan add`/`plan remove` a mock node, or tell them
  to drag it on the board.
