---
name: refresh-exam-dates
description: Research and update the current key dates (registration, admit card, exam day, results) for the exams tracked on the calendar page — CAT, GMAT, XAT, SNAP, NMAT. Use when the user asks to refresh exam dates, check current dates, update the calendar, or when they open the calendar page and want the latest schedule.
---

You keep the **calendar page** (`/calendar`) current by web-searching the official
schedules and writing them through the `catac` CLI. NEVER edit the DB directly — go
through `bun run catac dates`, which the calendar page reads.

Tracked exams (fixed set): **cat, gmat, xat, snap, nmat** (`bun run catac dates exams`).

## Steps

1. **See what's stored now:** `bun run catac dates list --json`.

2. **Research each exam's current cycle.** For each of the five, web-search the official
   site (and reliable aggregators) for the latest dates. Prefer the official source:
   - CAT → iimcat.ac.in
   - GMAT → mba.com (GMAT Focus Edition — on-demand, no fixed exam day)
   - XAT → xatonline.in
   - SNAP → snaptest.org (usually **multiple** test sessions in December)
   - NMAT → mba.com/exams/nmat (a scheduling **window**, not one day)

   Capture, per exam: **registration** window (start→end), **admit card**, **exam day(s)**
   (or exam window), and **result**. Note when a date is approximate/expected.

3. **Write each exam's dates** (bulk replace is cleanest). Build a JSON array and set it:
   ```bash
   bun run catac dates set <examId> --file /tmp/<examId>-dates.json
   ```
   Each element:
   ```json
   { "kind": "registration|admit_card|exam_day|result|window|other",
     "label": "human label",
     "date": "YYYY-MM-DD",
     "endDate": "YYYY-MM-DD (optional, for windows / multi-day)",
     "notes": "e.g. 'approx' or 'expected'",
     "source": "https://official-site" }
   ```
   `dates set` replaces ALL of that exam's events, so include the full cycle each time.
   (For one-off tweaks: `dates add <examId> --kind K --label ".." --date YYYY-MM-DD`,
   or `dates clear <examId>`.)

4. **Confirm:** `bun run catac dates list` and tell the user what changed. Point them to
   `/calendar` to view it.

## Notes

- Always set a **source** URL and mark uncertain dates in **notes** ("approx", "expected",
  "tentative") — official notifications shift year to year.
- GMAT has no fixed exam date; store one `other` note ("On-demand year-round — book at
  mba.com") rather than inventing a day.
- SNAP typically runs 3 sessions; add an `exam_day` (and matching `admit_card`) for each.
- NMAT is a test **window** — use one `exam_day` event with `date`→`endDate` spanning it.
- On bad input the CLI exits non-zero with `{"error","name"}` (`--json`): `InvalidEventError`
  → fix the date format (`YYYY-MM-DD`) or use a valid exam id from `dates exams`.
