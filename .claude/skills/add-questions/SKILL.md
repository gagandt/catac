---
name: add-questions
description: Research and author a verified practice-question bank per subtopic, stored inside the exam pack (no database table). Use when the user wants practice questions, quizzes, drilling, "add questions for quant", "give me practice", or a per-subtopic question set.
---

Add practice questions to subtopics. They live in each subtopic's `practice` array
**inside the same `materialJson` blob** as the study material — no separate table, so
the whole bank ships in the shareable pack and seeds for free. Re-seed after editing.

## Question shape (per item, inside a subtopic's `practice` array)

```jsonc
{
  "q": "the question stem (realistic, exam-style, self-contained)",
  "options": ["A) …", "B) …", "C) …", "D) …"],   // omit entirely for TITA / type-in
  "answer": "B) …",                               // the correct option text or value
  "solution": "concise correct working that reaches the answer",
  "difficulty": "easy" | "medium" | "hard"
}
```

A subtopic then looks like:

```jsonc
{ "name": "Percentages", "frequency": "high", "summary": "...", "formulas": [...],
  "practice": [ { "q": "...", "options": [...], "answer": "...", "solution": "...", "difficulty": "medium" } ] }
```

## Steps

1. **Resolve slug + scope + count.** `bun run catac exam list`, `bun run catac
   syllabus <slug>`. Ask how many per subtopic (default **5**) and which section/topic
   (default: whole exam is large — confirm before doing all of it).

2. **Author, one agent per topic (fan out in parallel).** Each agent writes N
   questions per subtopic in its topic, mixed difficulty, matching how the real exam
   asks that subtopic. Include a worked `solution` for every question.

3. **VERIFY — mandatory. Wrong answer keys are harmful.** Run a second pass (a
   separate agent, or re-solve inline) that **independently re-solves each question**
   and checks the worked solution actually reaches the stated `answer`. Drop or fix any
   mismatch. Never ship an unverified key.

4. **Merge into `content/<slug>.json`:** add/extend each subtopic's `practice` array.
   Keep existing material fields intact.

5. **Re-seed:** `bun run db:seed <slug>`.

6. **Verify:** open the web app → exam → **ⓘ** on a subtopic → the **Practice** section
   lists the questions with a *show answer* toggle revealing answer + solution.

## Notes

- No DB schema change — questions are part of the pack. `catac pack export/import`
  carries them.
- Scale realistically: ~10 questions × dozens of subtopics is hundreds of items and a
  big verified authoring run. Do a section at a time and say what you covered.
- Run `/enrich-material` first if subtopics are still bare names.
