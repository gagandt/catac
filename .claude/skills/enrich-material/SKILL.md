---
name: enrich-material
description: Research and write real study material (concept summary, formulas, worked example, common traps, exam frequency) into an exam's subtopics. Use when subtopics are bare names, or the user says "add material", "flesh out CAT", "enrich the syllabus", "make it actual study content", or wants more than a topic list.
---

Turn bare subtopic names into real study material. Material lives **inside each
subtopic** in `content/<slug>.json` (the `materialJson` blob) — no separate table,
so it ships in the shareable pack and seeds for free. The running app reads the DB,
so you must **re-seed** after editing the JSON.

## Material shape (per subtopic)

A subtopic in the pack is either a bare string (legacy) or an object:

```jsonc
{
  "name": "Percentages",                 // keep EXACT name + order
  "frequency": "high",                   // high | medium | low | rare (CURRENT exam)
  "summary": "1-2 sentences: what it is + how the exam tests it",
  "formulas": ["x% of N = (x/100)·N", "..."],   // [] for verbal topics
  "keyIdeas": ["shortcut / intuition / how to attack it", "..."],  // 2-4
  "example": { "q": "one realistic exam-style question", "solution": "concise correct working + answer" },
  "traps": ["common mistake / gotcha", "..."]   // 1-3
}
```

Every field optional — carry as much as you have. The importer/exporter already
accepts `string | object`, so mixing enriched and bare subtopics is fine.

## Steps

1. **Resolve slug + scope.** `bun run catac exam list`, then
   `bun run catac syllabus <slug>` to see sections → topics → subtopics.
   Scope = whole exam, one section, or one topic (ask if unclear).

2. **Author material, one agent per TOPIC (fan out in parallel).** Each agent gets
   its topic's exact subtopic names + order and returns a JSON array (one object per
   subtopic) written to a scratch file. Rules to pass every agent:
   - **Accuracy is critical — students rely on this. Verify every formula.** A wrong
     formula is worse than none.
   - `frequency` reflects how the **current** exam (last ~3 years) actually tests it.
     Mark legacy / near-absent topics `"rare"` and say so in `summary` (e.g. for CAT:
     grammar/sentence-correction, analogies, trigonometry, binomial theorem).
   - One concrete worked `example`; 2-4 `keyIdeas`; 1-3 `traps`.
   - Preserve exact subtopic names and order; output valid JSON only.

3. **Merge into `content/<slug>.json`.** Replace each subtopic string with its object
   (match by name, keep order). Leave subtopics with no material as bare strings.

4. **Apply any data-integrity fixes you notice** while in the file: topic `weightPct`
   should sum to ~100 per section; every topic should have a non-null `weightPct` and
   `priority` (null weights break `catac next` ranking).

5. **Re-seed:** `bun run db:seed <slug>`.

6. **Verify:** `bun run catac syllabus <slug>` (tree intact), and in the web app open
   an exam → click the **ⓘ** on a subtopic → the material modal shows summary,
   formulas, example, traps, and a frequency badge.

## Related

- New exams from `/add-exam` seed with bare subtopics — run this next to add material.
- `/add-questions` adds a practice-question bank into the same subtopic blob.
