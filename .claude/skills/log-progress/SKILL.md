---
name: log-progress
description: Record study progress on syllabus topics. Use when the user says they studied/finished/practiced/mastered something, e.g. "done with percentages", "practiced quadratic equations", "I'm confident on blood relations", "reset geometry".
---

Translate what the user did into a `catac progress set` call.

## Steps

1. **Resolve the exam id** (`bun run catac exam list --json`; ask if ambiguous).

2. **Find the subtopic id** they mean:
   `bun run catac syllabus <examId> --json`, then match their phrase to a subtopic `id`
   or `name`. If several match (e.g. "geometry" spans many), list them and ask which, or
   apply to each in turn if they meant the whole topic.

3. **Map words → status:**
   - "started / reading / learning" → `learning`
   - "practiced / did questions / drilled" → `practiced`
   - "confident / done / mastered / solid" → `mastered`
   - "reset / start over" → `not_started`

4. **Set it:**
   ```
   bun run catac progress set <subtopicId> <status> [--confidence 1-5] [--notes "..."]
   ```
   Capture a confidence (1-5) if the user expressed one.

5. **Confirm**, then optionally show updated coverage: `bun run catac status <examId>`.

## Errors

- `UnknownSubtopicError` → you used a wrong id; re-read `syllabus --json` and pick the exact `id`.
- `InvalidStatusError` → use exactly one of `not_started | learning | practiced | mastered`.
