---
name: add-exam
description: Add a new exam to the tracker (XAT, GMAT, NMAT, SNAP, IIFT, CMAT, etc.). Use when the user wants to prepare for an exam that isn't seeded yet, or says "add GMAT", "I also want to track XAT". Researches the exam and writes a content pack, then seeds it.
---

Add a new exam by researching it and writing `content/<slug>.json`, then seeding.
The running app never reads that file — seeding loads it into the local DB, which is
the source of truth. Use `content/cat.json` as the canonical template.

## Steps

1. **Pick a slug.** Lowercase, short, stable: `xat`, `gmat`, `nmat`, `snap`, `iift`, `cmat`.
   Check it's not already there: `bun run catac exam list`.

2. **Research the exam** (web search). Gather, with sources:
   - Pattern: sections, questions per section, marks, timing, marking scheme.
   - Syllabus: topics per section, and subtopics per topic.
   - Scoring: how raw score maps to the result (percentile bands, scaled score, etc.).
   - Free resources: YouTube channels, free mocks, reading, communities.
   - Meta: official site, exam date(s), eligibility, fee.
   Mirror the depth of the CAT research in `research/cat-knowledge-base.md`.

3. **Write `content/<slug>.json`** in this shape (see `content/cat.json` for a full example):

   ```jsonc
   {
     "id": "<slug>",
     "name": "XAT",
     "fullName": "Xavier Aptitude Test",
     "meta":     { "officialSite": "...", "examDate": "YYYY-MM-DD", "...": "..." },
     "pattern":  { "totalQuestions": 0, "durationMinutes": 0, "...": "..." },
     "strategy": { "...": "..." },
     "sections": [
       {
         "id": "<slug>-verbal", "name": "Verbal & Logical Ability", "short": "VA",
         "questions": 26, "marks": 26, "timeMinutes": 0,
         "topics": [
           { "id": "<slug>-verbal-rc", "name": "Reading Comprehension",
             "weightPct": 40, "priority": "high",
             "subtopics": ["...", "..."] }
         ]
       }
     ],
     "scoring":  { "...": "..." },
     "resources": {
       "youtube":     [ { "name": "...", "strength": "..." } ],
       "mocks":       [ { "name": "...", "detail": "..." } ],
       "reading":     [ "..." ],
       "communities": [ "..." ]
     }
   }
   ```

   Rules:
   - `id` fields must be stable and unique. Prefix topic ids with the slug.
   - Subtopics are plain strings **or** objects carrying study material. Start with
     plain strings here (fast); the seeder assigns stable ids (`<topicId>-s1`, ...).
     An enriched subtopic looks like
     `{ "name": "Percentages", "frequency": "high", "summary": "...", "formulas": [...],
     "keyIdeas": [...], "example": { "q": "...", "solution": "..." }, "traps": [...] }`.
     Don't hand-author material here — seed bare, then run `/enrich-material` (below).
   - `marks` per section matters — the planner uses it to weight section time. Always fill it.
   - Scoring shape is free-form (`scoring` is stored as-is); model it however the exam works.
     Set `"scoringKind"` to name the model (`"percentile_bands"` for CAT, `"gmat_scaled"` for
     GMAT's 205-805, etc.) so it can be interpreted later. Defaults to `percentile_bands`.

4. **Seed it:** `bun run db:seed <slug>`.

5. **Verify:** `bun run catac exam list` (new exam appears) and
   `bun run catac syllabus <slug>` (tree looks right). It's now in the web picker and every skill.

6. **Offer to add real content.** A freshly-seeded exam is just a topic map. Offer:
   - `/enrich-material <slug>` — research + write study material (concept, formulas,
     worked example, traps, frequency) into every subtopic.
   - `/add-questions <slug>` — a verified practice-question bank per subtopic.

7. Offer `/plan-exam` to start planning the new exam.

## Note

To share an exam you built, `bun run catac pack export <slug> --out <slug>-pack.json` — that
file has content only (no personal progress) and imports with `catac pack import <file>`.
