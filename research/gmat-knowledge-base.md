# GMAT (Graduate Management Admission Test) — Complete Knowledge Base

> Scope: the **GMAT Focus Edition**, the only version offered since 31 Jan 2024. The
> old 4-part GMAT (AWA essay, Integrated Reasoning, Quant-with-DS, Verbal-with-Sentence-
> Correction, 200–800 scale) is **retired** — ignore it except when converting old scores
> via GMAC's official concordance.
>
> Researched 2026-07 for the `catac` tracker. Seeds `content/gmat.json` (`bun db:seed gmat`).
> Facts verified against GMAC/mba.com plus reputable secondary sources (Target Test Prep,
> e-GMAT, Magoosh); see §8. Where a figure is secondary or reverse-engineered it is labelled.

## 1. What the GMAT Is

- Conducted by **GMAC (Graduate Management Admission Council)**. Official site **mba.com**.
- Purpose: admission to MBA and business master's programmes worldwide. In India it is
  accepted by **ISB**, IIM 1-year/executive programmes, Great Lakes, SPJIMR PGPM and a
  growing list of schools (ISB's flagship PGP takes **test-center scores only**, not online).
- **On demand, year-round** — book any open slot; there is no fixed annual exam date.
- Delivered **at a test center OR online (at home)** — identical exam, questions and the
  same 205–805 scale. (ISB PGP is the notable exception that rejects the online version.)
- Scores are **valid 5 years**.

### Key logistics
- **Fee:** ~US$275 at a test center, ~US$300 online (≈US$25 online premium). India ≈
  ₹24,780 test-center / ₹27,036 online (USD-pegged, FX-varying, +18% GST). Registration
  includes up to 5 free score reports; extra reports US$35 each. Reschedule/cancel fees apply.
- **Attempts:** max **5 per rolling 12 months**, **16-day** minimum gap. **No lifetime cap**
  — the old 8-attempt lifetime limit was removed in **October 2024**. Online and test-center
  attempts count against the same 5-per-year cap.
- **Score transparency:** you see your official total before deciding whether to send it; the
  Enhanced Score Report is now included free.

### Eligibility
- Minimum age 18 (13–17 with parental consent). No formal education requirement to sit the
  exam; a bachelor's is expected by the MBA programmes that use the score. Open to anyone.

## 2. Exam Pattern (Structure)

| | Quantitative Reasoning | Verbal Reasoning | Data Insights |
|---|---|---|---|
| Questions | 21 | 23 | 20 |
| Time | 45 min | 45 min | 45 min |
| Content | Problem Solving MCQ only | Reading Comp + Critical Reasoning | DS, MSR, Table, Graphics, Two-Part |

- **64 questions, 2 h 15 min total**, plus one optional 10-min break. 5-option MCQ (Data
  Insights formats vary). **Question-level computer-adaptive** within each section.
- **All three sections weigh EQUALLY into the total** (big change — on the old GMAT,
  Integrated Reasoning didn't count toward the 200–800 total).

### Rules that shape strategy
- **You choose the order** of the three sections at the start.
- **No negative marking** — a wrong answer costs nothing. But you must answer the on-screen
  question to advance and **unanswered questions at a section's end are scored wrong** and hurt
  the adaptive path — so **answer every question** (guess before time runs out).
- **Question Review & Edit:** bookmark unlimited questions; at a section's end (time
  permitting) **change up to 3 answers** in that section only.
- **On-screen calculator only in Data Insights** — none in Quant, so drill mental/estimation math.

### What changed from the old GMAT (removed in Focus Edition)
- AWA / Analytical Writing **essay** — gone.
- **Sentence Correction** (Verbal) — gone; Verbal is only RC + CR now.
- **Geometry** (Quant) — gone (coordinate geometry survives under algebra); Quant is Problem
  Solving only.
- **Data Sufficiency moved out of Quant** and into Data Insights.
- Standalone **Integrated Reasoning** — folded into Data Insights.

## 3. Detailed Syllabus

### 3.1 Quantitative Reasoning (~21 Q) — Problem Solving only, no geometry, no DS
- **Arithmetic & Number Properties:** integers/factors/divisibility, primes & prime
  factorization, fractions & decimals, percentages, ratios & proportions, powers/roots/exponents.
- **Algebra:** linear equations & systems, quadratics, inequalities, absolute value,
  functions & sequences, algebraic expressions & factoring.
- **Word Problems:** speed-distance-time, work & rate, mixtures & alligation, simple &
  compound interest, profit-loss-discount, age & number-relation.
- **Statistics, Counting & Probability:** averages & weighted averages, median/mode/range,
  standard deviation & variance, permutations & combinations, probability, sets & Venn.

Character: conceptually narrower than CAT/GRE but **trickier** — answer choices are engineered
around the most common mistake. Precision, unit-checks and "must be true" beat raw speed.
No calculator here.

### 3.2 Verbal Reasoning (~23 Q) — RC + CR only, no Sentence Correction
- **Reading Comprehension:** main idea/primary purpose, inference, supporting detail,
  function & structure, tone & attitude, application/extension.
- **Critical Reasoning:** assumption, strengthen, weaken, evaluate, inference (must be true),
  explain the paradox, boldface/argument structure, flawed reasoning.

### 3.3 Data Insights (~20 Q) — the signature Focus section, equally weighted
- **Data Sufficiency:** the fixed A–E answer framework — decide *whether* the two statements
  are sufficient, not the value. Watch the C-trap.
- **Multi-Source Reasoning:** 2–3 tabs of text/data; synthesize across sources (often a
  3-part yes/no set).
- **Table Analysis:** a sortable table + true/false statements.
- **Graphics Interpretation:** chart/scatterplot + drop-down completion blanks.
- **Two-Part Analysis:** two-column table, pick one option per column from a shared list.

### Weighting note
`content/gmat.json` uses reverse-engineered per-topic weights (GMAC publishes no official
topic breakdown). Section sizes (21/23/20) and the equal-weight scoring are official.

## 4. Scoring — Total, Sections & Percentiles

- **Total 205–805**, in **10-point** steps. Each section **60–90**, in 1-point steps, and the
  three weigh **equally** into the total.
- Focus scores are **NOT directly comparable** to old-GMAT 200–800 numbers — always map via
  GMAC's concordance.
- **Global mean total ≈ 546–556** (GMAC ~546 early-Focus; some secondary sources ~554–556 over
  the Jul 2020–Jun 2025 population; no single crisp published headline — treat as uncertain).
  Section means ≈ Quant 78, Verbal 79, Data Insights 74.

### Total score → percentile (official GMAC concordance, published Jul 2025)
| Total | %ile | Total | %ile | Total | %ile |
|---|---|---|---|---|---|
| 805 | 100 | 665 | 92.1 | 545 | 41.9 |
| 745 | 99.7 | 655 | 90.5 | 535 | 39.2 |
| 725 | 99.1 | 645 | 86.7 | 515 | 31.5 |
| 705 | 98.0 | 635 | 81.9 | 495 | 25.1 |
| 685 | 95.8 | 615 | 76.4 | 465 | 16.6 |
| 675 | 94.8 | 605 | 70.3 | 445 | 12.7 |
| — | — | 565 | 50.9 (≈median) | 405 | 7.1 |

Full 10-point table lives in `content/gmat.json` → `scoring.totalPercentiles` (61 points).

### Section scaled score → percentile (Target Test Prep, secondary, ±1–2 pts)
Quant percentiles run **lower** than Verbal/DI for the same score (Quant distribution is
compressed high). Example — a scaled **84**: 85th %ile Quant / 89th Verbal / 97th Data Insights.
An **82**: 75th (Q) / 74th (V) / 93rd (DI). Adcoms see all three section percentiles.

### Old-GMAT concordance (for reading legacy averages)
685 ≈ old 730 · 655 ≈ old 700–710 · 645 ≈ old 700 · 605 ≈ old 650 · 545 ≈ old 580–590.

### Target Focus scores (Class of 2027 unless noted; converted figures labelled)
| School | Focus | Note |
|---|---|---|
| Stanford GSB | ~689 | highest-scoring US programme |
| Kellogg | ~687 | |
| Harvard (HBS) | ~685 | ≈ old 730 |
| Wharton | ~676 | |
| ISB PGP | **669** | Class 2026 avg; competitive ≈655+, test-center only |
| INSEAD / LBS | ~655 | converted from classic ~710/~700 (reverse-engineered) |
| "New 700" (top-25 competitive) | **645** | old-700 concordance = 86.7th %ile |
| M7-elite benchmark | **685** | old-730 concordance = 95.8th %ile |

## 5. Preparation Strategy

- Adaptive + no negative marking + edit-3 → the exam **rewards accuracy and steady pacing**
  over raw speed. Pacing ≈ 2 min/question (Q 2:08, V 1:57, DI 2:15).
- **Do not neglect Data Insights** — it is a full third of the score. A strong/weak DI can
  swing the total by tens of points, yet it's the most learnable (unfamiliar formats repay drill).

### Section-specific
- **Quant:** narrower content (no geometry/DS), nastier options — translate words precisely,
  check units, back-solve from options, pick smart numbers. No calculator.
- **Verbal:** name the CR question type first, find conclusion + gap, then attack; map RC
  structure rather than memorizing detail. No grammar/SC to study anymore.
- **Data Insights:** master the DS answer grid cold; drill multi-tab/table/graph reading speed;
  practise Two-Part and Graphics formats explicitly.
- **Edit feature:** bank a small time cushion, review only your 2–3 shakiest bookmarks; don't
  hunt the whole section for edits.
- **Section order:** pick a consistent order in practice (strongest-first to bank confidence,
  or DI-while-fresh) and keep it on test day.

### Mocks
- 6–10 full-length. **GMAC Official Practice Exams are the truest score read** — take one as an
  early baseline, save one for late prep. Review each mock at least as long as you sat it.

### Common failure modes
- Neglecting Data Insights; studying retired content (SC / geometry / AWA); leaving questions
  blank; chasing speed over early-question accuracy; misusing the edit feature; reading a Focus
  score as an old-GMAT score; fumbling the DS grid (C-trap) under time pressure.

## 6. Free Resources (curated)

### YouTube
- **GMAT Ninja** — best-rated free video explanations across Q/V/DI.
- **GMAT Club** — 1,800+ videos + free live sessions.
- **Target Test Prep** — conceptual Quant/DI mini-lessons.
- **Experts' Global** — sequenced full-curriculum lessons.
- **GMAC / GMAT Official (mba.com)** — authoritative on format/scoring/policy.
- Also: **e-GMAT** (non-native Verbal/DI), **Manhattan Prep**, **GMATPrepNow**, **Magoosh**.

### Free mocks & practice
- **GMAC Official Practice Exams 1 & 2 (free, Official Starter Kit)** — same adaptive algorithm
  & 205–805 scale as test day; the single most trustworthy free mock. (Exams 3–6 are paid.)
- **GMAT Club Tests** — 1 free adaptive Focus CAT + large official-style bank.
- **Manhattan/Kaplan free test** (now routes to the official Focus tests), **TTP** 5-day trial +
  free diagnostic, **Experts' Global** (1st of 15 free), **e-GMAT** free mock.

### Reading
- **GMAT Official Guide** (2025-2026, or cheaper 2024-2025) — the only real retired official
  questions; non-negotiable. The **Bundle** (OG + Quant + Verbal + **Data Insights Review**)
  adds ~1,600+ questions. Buy **current Focus editions** of Manhattan guides (older sets waste
  chapters on removed SC/geometry). **TTP** and **e-GMAT** are the top paid online platforms.

### Communities
- **GMAT Club** (gmatclub.com) — largest forum, free tests, expert explanations, error log,
  timer. **r/GMAT** (Reddit) — debriefs & resources. **Beat The GMAT**, Manhattan forum,
  community Discord/Telegram groups.

## 7. Related Exams
- **CAT** — Indian, once-a-year, harder quant (incl. geometry); GMAT is global & on-demand.
- **XAT** — Indian; adds Decision Making + GK; once a year in January.
- **GRE** — also accepted by most B-schools; more vocabulary-heavy, section-adaptive.
- **NMAT** — also by GMAC; multiple attempts, self-scheduled.

## 8. Sources

Official:
- GMAC Score Concordance Tables (PDF, ©2025) — total-score percentiles & old↔Focus concordance.
- mba.com — Understanding Your Score, FAQs, Prep for the Exam, official practice/guides.
- gmac.com — About the GMAT Focus Edition (exam scores, exam prep).

Secondary (labelled where used):
- Target Test Prep — Focus score chart / section percentiles.
- e-GMAT, Magoosh — percentiles, key-changes, average-score roundups.
- Jamboree / Manya — India fee breakdown.
- CrackVerbal / MIM-Essay / LilacBuds / goalisb — ISB & top-school target scores.

> Section percentiles, mean total, INSEAD/LBS targets and India fee are secondary or
> reverse-engineered and labelled as such above and in `content/gmat.json`. Total-score
> percentiles, the 3×45-min structure, equal weighting and the 205–805 scale are official.
