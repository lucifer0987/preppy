# Preppy — Product Requirements Document

**Daily exam-simulation platform for IBPS Specialist Officer (IT) aspirants**

| Field | Value |
|---|---|
| Document owner | Gaurav Kumar |
| Status | Draft v1.2 — for build |
| Last updated | 25 September 2026 |
| Target exams | IBPS SO IT Officer (Scale I), IBPS RRB Officer Scale II (Specialist — IT) |
| Discipline scope | Computer Science & Engineering only |
| Initial cohort | 5 students + 1 admin |
| All times | IST (Asia/Kolkata) |

---

## 0. What v1.2 removes

v1.2 is a deliberate simplification pass. Nothing was added; the following was cut or collapsed.

| Cut | v1.1 | v1.2 |
|---|---|---|
| Integrity logging | `integrity_events` table, 3 event types with timestamps and durations, 90-day purge job | **Two integer counters** on the attempt row. No table, no timestamps, no retention policy |
| Leaderboard storage | `leaderboard_snapshots` table written nightly | **Computed on read.** Five rows — a snapshot table is more machinery than the query it replaces |
| Admin audit | `admin_audit_log` table | **Dropped.** One admin auditing themselves is theatre |
| Options | Separate `options` table + join | **`options` JSON column** on the question |
| Cron jobs | 2 | **1** |
| Cohort comparison | Sectional score vs cohort average, paired bars | **Dropped** — see FR-5.3 |
| Per-question cohort stats | "% of cohort who got this right" shown to students | **Admin only**, and reduced to one number |
| Rewards | Badge system, section-mastery badges, perfect-week | **Streaks + personal best + podium** only |
| Exports | Leaderboard CSV, attempts CSV, item-stats CSV | **One JSON question-bank export** |
| Percentiles | Percentile everywhere | **"2nd of 5"** |
| Admin on leaderboard | Exclusion logic threaded through every aggregate query | **Admin attempts are always dry runs** — one rule, no exclusion logic |

**Tables: 12 → 8. Cron jobs: 2 → 1. Logged event types: 11 (v1.0) → 3 (v1.1) → 0 (v1.2, counters only).**

### Open questions closed in v1.2

Question bank backup lives in the database (Q7) · a sixth member starts from zero (Q8) · admin gets a dry-run mode (Q9) · students see nothing about each other except the leaderboard (Q10).

---

## 1. Overview

### 1.1 Summary

Preppy is a closed-cohort, asynchronous daily mock-test platform. Every night at 22:00 IST a 55-question, 45-minute sectional test unlocks. Members take it under exam conditions, get scored on the real IBPS marking scheme, and are ranked on a cumulative leaderboard that carries forward indefinitely. A single admin publishes each day's paper by uploading a PDF in a fixed format.

It wears Kahoot's visual language throughout — colour, shapes, motion, podiums, streaks — over an exam-standard interaction model inside the test itself.

### 1.2 Problem

Serious IBPS SO aspirants practise alone. Commercial test series are generic, expensive, and give a percentile against an anonymous mass that means nothing. A study group that wants to drill together every night has no tool that combines real exam conditions, real marking, a persistent ranking among people they actually know, and the ability to run their *own* question bank.

### 1.3 Users

**The Aspirant.** Final-year CSE student or working IT professional, 21–27. Studies at night, owns a laptop, and is motivated far more by beating four people they know than by a percentile against 200,000 strangers.

**The Admin.** One person sources the questions, formats them into the PDF contract, and publishes nightly. Not a developer. Their daily cost must stay under five minutes.

**Cohort at launch: 5 students + 1 admin = 6 accounts.**

### 1.4 Goals

| # | Goal |
|---|---|
| G1 | Reproduce IBPS exam conditions faithfully enough that a Preppy score predicts a real score |
| G2 | Make the daily test a habit — a fixed nightly appointment, with streaks and rank as the hook |
| G3 | Keep the admin's daily publishing cost under five minutes |
| G4 | Make every past test a permanent, browsable study asset |
| G5 | Sustain competition across months via a cumulative leaderboard |

### 1.5 Non-goals

Financial Awareness, General Awareness, Computer Awareness · **any Hindi variant — English only** · disciplines other than CSE · live synchronous multiplayer · public sign-up · payments · native mobile apps · webcam or AI proctoring · AI question generation · forums, comments, doubt-solving · adaptive difficulty · **any social feature beyond the leaderboard**.

### 1.6 Success metrics

| Metric | Target by week 8 |
|---|---|
| Nightly participation | ≥ 4 of 5 students |
| Completion rate (submitted ÷ started) | ≥ 95% |
| Median 7-day student streak | ≥ 5 |
| Admin publish time, upload → scheduled | ≤ 5 min |
| PDF first-pass parse success | ≥ 90% |
| Attempts lost to a technical fault | 0 |

---

## 2. Exam context

Preppy does not clone either target exam. It runs one custom daily pattern that drills all four in-scope sections every night.

| Exam | Real pattern (reference only) | Pace |
|---|---|---|
| IBPS SO IT Officer — Prelims | Reasoning 50q/40min, English 50q/40min, Quant 50q/40min | 48 s/q |
| IBPS SO IT Officer — Mains | Professional Knowledge 60q/45min | 45 s/q |
| IBPS RRB Officer Scale II (IT) | Six sections of 40q | 60 s/q |

Common to both, and honoured by Preppy: objective MCQs with five options, sectional time limits with no carry-over, and a 0.25-mark penalty per wrong answer.

---

## 3. Test pattern and scoring

### 3.1 Pattern

> **FR-3.1** — Every daily test is exactly 55 questions across 4 sections in 45 minutes, with an independent timer per section.

| Order | Section | Code | Questions | Time | Sec/question |
|---|---|---|---|---|---|
| 1 | Quantitative Aptitude | `QUANT` | 15 | 12:00 | 48 |
| 2 | Reasoning Ability | `REASONING` | 15 | 12:00 | 48 |
| 3 | English Language | `ENGLISH` | 10 | 09:00 | 54 |
| 4 | Professional Knowledge (CSE) | `PK` | 15 | 12:00 | 48 |
| | **Total** | | **55** | **45:00** | **49** |

> **FR-3.2** — Section order, question counts and durations are stored per test and overridable from the PDF header.

**✓ Pacing is correct.** 48 s/q for Quant, Reasoning and PK is an exact match for IBPS SO Prelims and more generous than SO Mains PK (45 s/q). English at 54 s/q carries margin for comprehension passages.

### 3.2 Scoring

> **FR-3.3** — **+1** correct, **−0.25** wrong, **0** unattempted. Maximum **+55.00**, minimum **−13.75**.

- Two decimals, displayed signed when negative.
- A question left **Marked for Review** with no option selected is unattempted and scores 0.
- Per-section `MARKS` and `NEGATIVE` overridable in the PDF header.
- No sectional cut-offs. Rank is total score alone.

### 3.3 Not reached vs skipped

> **FR-3.4** — Unattempted questions are recorded in **two categories**, both scoring 0:

| Category | Definition | What it tells the student |
|---|---|---|
| **Skipped** | Opened the question, did not answer, section ended | A decision — they saw it and passed |
| **Not reached** | Never opened it before the section ended | A pacing failure — they ran out of time |

These map onto the live palette: *Not answered* (red) becomes **Skipped**; *Not visited* (grey) becomes **Not reached**. The remedies are opposite — skipping too much is a confidence problem, not reaching is a speed problem.

### 3.4 Stored per attempt

`total_score` · `section_scores_json` · `attempted` · `correct` · `wrong` · `skipped` · `not_reached` · `time_spent_sec` · `fullscreen_exits` · `tab_switches`.

Accuracy, rank, average and cohort size are **computed on read**, not stored.

---

## 4. The daily clock

One repeating 24-hour cycle. **Almost every state is computed from the clock on read.** Exactly one job does durable work.

| Time (IST) | Event | System action |
|---|---|---|
| — | Admin prepares | Upload, validate, dry-run and schedule a paper for any future date |
| **22:00** | **Test unlocks** | Status reads `LIVE`. Dashboard flips from countdown to the entry card |
| **23:15** | **Entry closes** | No attempt may start at or after 23:15. Last possible start is 23:14:59 |
| **23:59** | **Hard stop** | The 23:14:59 entrant's 45 minutes expire |
| 00:00 | Archive unlocks | Questions, keys and solutions become visible to everyone (computed on read) |
| **00:05** | **Finalise** | Force-submit and score any attempt still open. *The only scheduled job.* |

> **FR-4.1** — **Entry closes at 23:15 while the window runs to 23:59.** The 44-minute tail exists so a student starting at the last possible moment still gets their full 45 minutes.

> **FR-4.2** — Score and rank appear the instant a student submits. Because the leaderboard is computed on read (FR-10.2), rank is correct immediately — there is no provisional state to explain.

> **FR-4.3** — Correct answers and solutions are withheld from **every** user — including those who already submitted — until 00:00.

### 4.1 Test lifecycle

`DRAFT` → `SCHEDULED` → `LIVE` → `CLOSED`

`LIVE` and `CLOSED` are **derived from the clock**, not written by a job. A test dated today reads `LIVE` between 22:00 and 23:59 and `CLOSED` after.

### 4.2 Attempt states

| State | Meaning | Counts |
|---|---|---|
| `IN_PROGRESS` | Started, timer running, resumable | — |
| `SUBMITTED` | Student pressed End Test | ✓ |
| `AUTO_SUBMITTED` | Timer expired, or force-closed by the 00:05 job | ✓ |
| `VOIDED` | Invalidated by admin | — |

Dry-run attempts (`is_dry_run = true`) never count, whatever their state.

---

## 5. Roles, access and privacy

| Capability | Student | Admin |
|---|---|---|
| Log in with username + password | ✓ | ✓ |
| Take the live test, counted | ✓ | ✗ |
| Take any test as a dry run | ✗ | ✓ |
| View own results and the archive | ✓ | ✓ |
| View leaderboard | ✓ | ✓ |
| Appear on the leaderboard | ✓ | ✗ |
| Upload, validate, publish papers | | ✓ |
| Create, reset, deactivate users | | ✓ |
| View all attempts | | ✓ |
| Edit a published question and rescore | | ✓ |
| Void an attempt | | ✓ |
| Export the question bank | | ✓ |

> **FR-5.1** — There is **no public sign-up**. Accounts exist only because an admin created them.

> **FR-5.2 — Admin attempts are always dry runs.** The admin can take any paper — draft, scheduled or live — and it is never counted, never ranked, never on the leaderboard, and never in any aggregate. This replaces v1.1's exclusion logic threaded through every query with a single flag set at attempt creation. The admin cannot compete, by construction.

> **FR-5.3 — Students see nothing about each other except the leaderboard.** The leaderboard is the **only** surface exposing another person's data, and it exposes exactly its own columns: display name, total points, tests taken, average, accuracy, best score, streak. Everywhere else, a student sees only their own data.

Specifically **removed** to honour this:

- Cohort average comparison bars on the result page.
- "% of the cohort got this right" in the answer review.
- Participation counts on archive rows.
- Any indication of who has or has not submitted tonight.
- Any view of another student's answers, timings, attempt detail or integrity counters.

---

## 6. Functional requirements

### 6.1 Authentication

> **FR-6.1.1** — Login accepts **username and password only**.

**Implementation.** Supabase Auth is the identity store. It requires an email, so a username maps to a synthetic internal address, `<username>@preppy.local` — never shown, never collected, never sent mail. No SMTP is configured.

- Usernames 3–20 chars, `[a-z0-9_]`, lowercase-normalised, unique.
- Hashing, sessions and refresh are **Supabase Auth's job**. No custom crypto.
- **FR-6.1.2** — Admin-created users must change their password on first login.
- **FR-6.1.3** — No self-service recovery; there is no email to send it to. The admin resets passwords. The login screen says so.
- **FR-6.1.4** — Starting a test invalidates that user's other sessions.

### 6.2 Home screen (logged out)

Product name, tonight's pattern summary, a **live countdown to the next 22:00 unlock**, and a single **Log in** action. No sign-up link.

> **FR-6.2.1** — No public leaderboard preview. With five members, an "anonymised top 5" is the entire cohort.

### 6.3 Dashboard

Three panels, fixed order.

#### Panel 1 — Tonight's test

| Condition | Display |
|---|---|
| Live, not attempted, before 23:15 | Entry card: date, pattern, marking, time left to enter, **Start Test** |
| Live, in progress | **Resume Test** with live remaining time |
| Live, at/after 23:15, not attempted | "Entry closed at 11:15 PM" + countdown to tomorrow |
| Live, already submitted | Score and rank, "Answers unlock at midnight" |
| Not live | Countdown to 22:00, current streak |
| No test scheduled | "No test tonight" + countdown to the next scheduled paper |

> **FR-6.3.1** — **Start Test** opens a briefing: pattern, marking, section order, the one-way section rule, the full-screen policy, and "your timer starts the moment you press Begin". The server stamps `started_at` on that action.

#### Panel 2 — Test archive

Reverse-chronological list of closed tests: date, attempted badge, **your** score, **your** rank. Nothing about anyone else.

- **FR-6.3.2** — Every closed test is fully browsable — all questions, options, keys and solutions — whether or not the student attempted it.
- **FR-6.3.3** — For an attempted test, the review overlays the student's own answer, per-question time, and whether each unattempted question was **skipped or not reached**.
- **FR-6.3.4** — A missed test can be **reviewed but never attempted**.
- Filters: by section · **"questions I got wrong"** · **"questions I never reached"**.

#### Panel 3 — Leaderboard

Five students, shown inline in full. The current user's row is highlighted.

### 6.4 Test engine

> **FR-6.4.1 — Layout.** One question at a time, a palette rail beside it, and a header carrying section name, timer, progress and the violation counter.

> **FR-6.4.2 — One-way section navigation.** Within a section the student jumps freely via the palette. They may move **forward** to the next section at any time. They may **never** return to a previous one.

> **FR-6.4.3 — Next Section is explicit,** with a confirmation dialog summarising answered / skipped / not-reached counts and a warning that the section cannot be re-entered. On the final section it reads **End Test**.

> **FR-6.4.4 — Palette states.**

| State | Colour | Becomes at section end |
|---|---|---|
| Not visited | grey | **Not reached** |
| Not answered | red | **Skipped** |
| Answered | green | Attempted |
| Marked for review | purple | **Skipped** |
| Answered & marked | purple + green dot | Attempted |

> **FR-6.4.5 — Controls.** `Save & Next` · `Mark for Review & Next` · `Clear Response` · `Previous` · palette jump within-section · `Next Section`.

> **FR-6.4.6 — Sectional timer.** On expiry the section locks and the next opens automatically. **Unused time never carries over.**

> **FR-6.4.7 — Timer authority.** The server owns the clock. The client renders a countdown for display only; every response write returns authoritative remaining time.

> **FR-6.4.8 — Persistence.** Every response writes to the server immediately (300 ms debounce) and mirrors to `localStorage`. Refresh, crash or network loss resumes at the right question with the right remaining time. Disconnect time is **not** refunded.

> **FR-6.4.9 — Offline tolerance.** Non-blocking banner; responses queue locally and flush on reconnect. The timer keeps running.

> **FR-6.4.10 — Direction blocks.** Shared passages, DI tables and puzzles render above the question, pinned and independently scrollable, on every question in the group.

> **FR-6.4.11 — Keyboard.** `1`–`5` select, `Enter` saves and advances, `M` marks, `←`/`→` navigate. Visible focus rings throughout.

### 6.5 Full-screen and integrity

**Policy: warn and count. Never auto-submit. Store two integers.**

> **FR-6.5.1** — Begin requests full-screen. If the browser denies it, the test does not start.

> **FR-6.5.2 — Honest constraint.** Every browser guarantees `Esc` exits full-screen and no web application can override that. Preppy treats full-screen as **deterrence, not prevention**, and says so in the briefing.

> **FR-6.5.3** — On violation, an opaque overlay covers the question: *"Return to full screen to continue."* **The section timer keeps running** — otherwise leaving full-screen becomes a pause button.

> **FR-6.5.4 — Two counters, no log table.** The attempt row carries `fullscreen_exits` and `tab_switches`, each an integer incremented in place. There is no `integrity_events` table, no timestamps, no durations, no event list, and therefore **no retention policy to implement** — the counters are part of the attempt and live as long as it does.

> **FR-6.5.5** — The live count shows in the test header. The result page shows the final two numbers. The admin sees the same two numbers on the attempt row.

> **FR-6.5.6** — The test **never** auto-submits on a violation. Only timer expiry or the 23:59 hard stop ends a test the student did not end.

> **FR-6.5.7 — Best-effort deterrents.** Selection, copy, cut, paste, right-click and print are suppressed; `Ctrl/⌘+P`, `Ctrl/⌘+S` and `F12` intercepted. Friction, not security. **Not counted or stored.**

> **FR-6.5.8 — Device policy.** Taking a test requires a viewport ≥ 1024 px. Smaller viewports get a friendly block explaining the real exam is desktop-only too.

**Trade-off, stated plainly.** Counters tell you *that* something happened, never *when* or *for how long*. If you ever suspect someone, you will have a number and no context. For five people who know each other, that is the right trade; the counter's job is deterrence, and a number on a result page deters exactly as well as a timestamped log.

### 6.6 Results

Everything on this page is about the student and nobody else.

- **Headline:** total out of 55, animated count-up, full Kahoot celebration.
- **Rank:** *"2nd of 5."* No percentile — at n=5 a percentile is noise.
- **Sectional table:** score, attempted, correct, wrong, **skipped**, **not reached**, accuracy, time used.
- **Pacing verdict** from the skipped/not-reached split: *"You never reached 4 questions in Quant. That's a speed problem, not a knowledge problem."*
- **Slowest three questions** per section.
- **Integrity:** the two counters.
- **Leaderboard delta:** cumulative rank before → after.
- **Review answers** — enabled from 00:00.

### 6.7 Leaderboard

> **FR-6.7.1 — Ranking** is **cumulative total score**, all-time. Dry runs excluded, which means admin attempts are excluded automatically.

**Columns:** Rank · Movement (▲▼ vs last test) · Student · **Total Points** · Tests Taken · Avg/Test · Accuracy % · Best Score · Streak.

> **FR-6.7.2 — Tie-breaks:** higher total → higher accuracy % → lower cumulative time → earlier first attempt.

> **FR-6.7.3 — Computed on read.** Five students across a few hundred tests is a trivial aggregate. A snapshot table would be more machinery than the query it replaces, and it would need its own invalidation story after a rescore.

> **FR-6.7.4** — Voided and dry-run attempts excluded. Negative cumulative totals are possible and displayed honestly.

> **FR-6.7.5 — A new member starts from zero.** A sixth student joining in month two begins at 0 cumulative points and climbs from there. This is accepted deliberately; the **Last 30** filter is the view that stays meaningful for them.

- Filters: All-time (default) · **Last 30** · a single test's rank list.
- Top 3 render as an animated Kahoot podium.

### 6.8 Streaks *(P1)*

Current streak, longest streak, personal-best celebration, podium. **No badge system** — streaks and the podium carry the motivational load.

### 6.9 Admin console

At `/admin`, gated on `role = admin` server-side.

#### 6.9.1 Paper ingestion

1. **Upload** a PDF, optionally with images for DI sets, puzzles and diagrams. `.txt` accepted as fallback.
2. **Extract** text and run the grammar parser.
3. **Validate** — blocking errors separated from warnings, each with a line number.
4. **Preview** — every question rendered in the exact student interface, with key and solution. Cannot be skipped.
5. **Dry run** *(optional)* — take the paper end to end in the real test engine (FR-6.9.3).
6. **Schedule** — assign a date; save as draft or publish.

> **FR-6.9.1** — **Publishing is never automatic.** A paper reaches `SCHEDULED` only by explicit admin action after preview.

**Blocking errors:** wrong question count · missing or unparseable key · key not among the options · fewer than 2 or more than 5 options · duplicate question numbers · referenced image not uploaded · `#DIRECTIONS` range covering non-existent questions · unrecognised section code · date already holds a published test.

**Warnings (publishable):** no solution · no tag · no difficulty · option text over 300 characters · fewer than 5 options · suspiciously low extracted character count, which usually means a scan.

#### 6.9.2 Dry run

> **FR-6.9.3** — The admin can take **any** test — `DRAFT`, `SCHEDULED`, `LIVE` or `CLOSED` — as a dry run. It uses the real test engine: real sectional timers, real full-screen, real scoring. The attempt is stored with `is_dry_run = true`, is visible only to the admin, and is excluded from the leaderboard, from ranks and from every aggregate. Dry runs can be taken repeatedly and deleted freely.

This is how a paper gets proofread at full speed, and it is the reason FR-5.2 can be so blunt: the admin has a first-class way to take tests that is structurally incapable of competing.

#### 6.9.3 User management

Create a single user; bulk-create from CSV; auto-generate passwords; reset; activate/deactivate; view any student's attempt history. Accounts created via the Supabase Admin API from server code.

#### 6.9.4 Test and question management

Browse every test with all questions, keys and solutions. Edit a question, its options, its key or its solution after publication.

> **FR-6.9.4 — Rescore.** Editing a key on a closed test offers **Rescore**, which recomputes every affected attempt. Because the leaderboard is computed on read, **nothing else needs recomputing** — the board is correct on the next page load. Affected students see a "this test was rescored" notice on their result page.

> **FR-6.9.5 — One item statistic.** The admin sees **% correct** per question, and nothing else per item. Any item below 10% correct is flagged for key review. This is the minimum needed to catch a bad key, which is the only reason item statistics exist here.

#### 6.9.5 Export

> **FR-6.9.6** — A single **Export question bank (JSON)** action producing every test ever published, with sections, questions, options, keys and solutions. This is the manual escape hatch referenced in §9.2.

---

## 7. The PDF contract

The highest-risk component. PDF text extraction is lossy, so the format is rigid and the parser strict — it fails loudly rather than guessing.

- Text-based PDF only. **Scanned or image-only PDFs are rejected** — no OCR.
- One question block per question, in presentation order. Blank line between blocks.
- Keys case-insensitive. Option labels accept `A)`, `A.` or `(A)`.
- Everything except `Q`, the options and `ANS:` is optional.

```
#TEST
DATE: 2026-09-26
TITLE: Daily Mock 042              (optional)

#SECTION: QUANT
DURATION: 12                       (minutes; defaults to pattern)
MARKS: 1                           (default 1)
NEGATIVE: 0.25                     (default 0.25)

Q1. A train 150 m long crosses a pole in 15 seconds. Find its speed.
A) 30 km/h
B) 36 km/h
C) 40 km/h
D) 45 km/h
E) None of these
ANS: B
SOL: Speed = 150/15 = 10 m/s = 10 x 18/5 = 36 km/h.
TAG: Speed-Time-Distance
DIFF: Easy

#DIRECTIONS: Q6-Q10
Study the table below and answer the questions that follow.
[IMG: di_table_1.png]
#ENDDIRECTIONS

Q6. ...

#SECTION: REASONING     DURATION: 12
#SECTION: ENGLISH       DURATION: 9
#SECTION: PK            DURATION: 12

#ENDTEST
```

| Directive | Scope | Required | Notes |
|---|---|---|---|
| `#TEST` / `#ENDTEST` | file | ✓ | Outer wrapper |
| `DATE:` | test | ✓ | `YYYY-MM-DD`, the date it goes live |
| `TITLE:` | test | | Defaults to "Daily Mock — {date}" |
| `#SECTION:` | section | ✓ | `QUANT` · `REASONING` · `ENGLISH` · `PK` |
| `DURATION:` | section | | Minutes; overrides the pattern |
| `MARKS:` / `NEGATIVE:` | section | | Overrides the marking |
| `Qn.` | question | ✓ | Sequential within the file |
| `A)`–`E)` | question | ✓ | 2–5 options |
| `ANS:` | question | ✓ | A single option letter |
| `SOL:` | question | | Multi-line, until the next directive |
| `TAG:` | question | | Topic |
| `DIFF:` | question | | Easy · Medium · Hard |
| `[IMG: file]` | anywhere | | References a separately uploaded image |
| `#DIRECTIONS: Qa-Qb` / `#ENDDIRECTIONS` | group | | Shared passage, DI set or puzzle |

> **FR-7.1** — `#DIRECTIONS` is mandatory infrastructure. Reading comprehension, cloze tests, DI sets and seating-arrangement puzzles are a large share of a real IBPS paper and are unrepresentable without it.

> **FR-7.2** — A downloadable `template.pdf`, a filled `sample.pdf` and a one-page cheatsheet ship with the admin console. Format drift is the most likely cause of a missed night.

---

## 8. Design direction

### 8.1 Kahoot everywhere

**The entire product wears Kahoot's visual language, including inside the test** — saturated colour, chunky rounded cards, bold display type, shape-coded options, podium, confetti, streaks.

What stays exam-standard inside the test is the **interaction model, not the look**: one question at a time · palette rail · one-way section navigation · Save & Next / Mark for Review / Clear Response · a visible, authoritative sectional countdown.

> **FR-8.1 — The one restraint inside a running section.** Celebratory motion and sound do not fire while a section timer is running. This is a focus decision, not a theme decision — an animation over a Quant question costs marks. Celebration fires at section end and on results, fully on.

### 8.2 Colour

Kahoot's option shapes carry the product: **▲ red · ◆ blue · ● yellow · ■ green · ★ purple**. Shape-plus-colour keeps options distinguishable to colour-blind users — the brand device itself satisfies an accessibility requirement.

The palette legend uses the same hues, mapping onto the exam vocabulary students know: **green** answered · **red** not answered · **purple** marked · **grey** not visited.

### 8.3 Sound

Off by default, toggleable, remembered per user. Never during a running section.

### 8.4 Accessibility

WCAG 2.1 AA contrast · full keyboard operation · visible focus rings · `prefers-reduced-motion` respected · status never encoded by colour alone · screen-reader labels on palette cells.

---

## 9. Data model

**Eight tables.**

| Table | Key fields |
|---|---|
| `profiles` | id (= auth.users.id) · username (unique, lower) · display_name · role · is_active · must_change_password · created_at |
| `tests` | id · date (unique) · title · status · source_pdf_path · published_by · published_at |
| `sections` | id · test_id · code · order · duration_sec · marks_correct · marks_negative · question_count |
| `direction_blocks` | id · section_id · content · image_paths[] · q_from · q_to |
| `questions` | id · section_id · direction_block_id · number · text · image_paths[] · **options jsonb** · correct_option · solution · tag · difficulty |
| `attempts` | id · test_id · user_id · state · **is_dry_run** · started_at · submitted_at · total_score · section_scores_json · attempted · correct · wrong · skipped · not_reached · time_spent_sec · **fullscreen_exits** · **tab_switches** |
| `attempt_sections` | id · attempt_id · section_id · started_at · ended_at · end_reason |
| `responses` | id · attempt_id · question_id · selected_option · is_marked · **was_visited** · time_spent_sec · updated_at |

Dropped from v1.1: `options` (now a JSON column), `integrity_events`, `leaderboard_snapshots`, `admin_audit_log`.

> **FR-9.1** — `responses.was_visited` makes not-reached vs skipped possible. A row is written the moment a question is *opened*, not only when answered. No row at section end means **not reached**; a row with `selected_option IS NULL` means **skipped**.

> **FR-9.2 — The database is the question bank.** Once a PDF is parsed and published, the questions, options, keys and solutions live in Postgres and that is the system of record. The source PDF is kept in Storage as provenance only — deleting it loses nothing. Supabase takes automatic daily backups of the database, and FR-6.9.6 provides a one-click JSON export as the manual escape hatch.

Indexes: `attempts(test_id, total_score DESC)` · `attempts(user_id)` · `responses(attempt_id)` · `questions(section_id, number)`.

All timestamps stored UTC; rendered Asia/Kolkata.

---

## 10. Technical architecture

Chosen for a builder who does not write web code. One language, one framework, one vendor, minimum moving parts.

### 10.1 Stack

| Layer | Choice | Note |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript** | UI and backend in one project. TypeScript kept deliberately — it catches mistakes before they run |
| Backend | **Route Handlers + Server Actions** | No separate service. All JavaScript |
| Database | **Supabase Postgres** | |
| DB access | **`supabase-js` + generated types** | No ORM, no migration tool to learn |
| Auth | **Supabase Auth** | Username → `<username>@preppy.local`. No custom crypto |
| Storage | **Supabase Storage** | Source PDFs and question images |
| PDF parsing | **`pdfjs-dist`** in a Route Handler | Pure JavaScript, server-side |
| Styling | **Tailwind CSS** | |
| Celebration | **`canvas-confetti`** | CSS animations cover the rest; no animation library |
| Hosting | **Vercel** | |
| Scheduling | **Vercel Cron — 1 daily job** | §10.2 |

**Everything is JavaScript or TypeScript. No Python, no ORM, no separate API server, no second provider.**

### 10.2 One job; everything else computed on read

> **FR-10.1** — Test status is **derived from the clock on every read**. A test dated today reads `LIVE` between 22:00 and 23:59, `CLOSED` after. Unlock, entry-close and archive-unlock need no job and therefore cannot fail.

> **FR-10.2** — The leaderboard, ranks, accuracy, averages and streaks are **computed on read** from the `attempts` table. With five students this is a few dozen rows. Nothing is precomputed, so nothing can go stale — and a rescore needs no cache invalidation.

| Cron | Time | Work |
|---|---|---|
| **Finalise** | 00:05 | Force-submit and score any attempt still `IN_PROGRESS`. That is the whole job. |

> **FR-10.3** — The job is **idempotent** — re-running produces identical output — and can be triggered manually from the admin console.

**The v1.1 publish-reminder job is dropped.** With no SMTP configured there is nowhere to send a reminder, so it would have needed a whole notification channel to be useful. Instead the admin dashboard shows tonight's status — **Scheduled** or **Not scheduled** — as its first element. For the reminder itself, a recurring 21:45 phone alarm does the job with no code.

### 10.3 The one security rule

> **FR-10.4** — **Never query Supabase from the browser.** All database access happens in server code using the service-role key, held in a server-only environment variable. Row Level Security is enabled on every table with **deny-all** policies as a backstop, so a leaked anon key reads nothing.

Deliberately simpler than per-table RLS policies. With six accounts, writing and debugging fine-grained policies is more risk than it removes, and one memorable rule is easier to follow correctly than a dozen policies.

### 10.4 Scale

The design target is six accounts. Nothing here needs revisiting below roughly 500 concurrent users.

---

## 11. Edge cases

| Case | Behaviour |
|---|---|
| Refresh mid-test | Resume at the same question with correct remaining time; no time refunded |
| Browser crash / power loss | Same as refresh; responses persisted to the last write |
| Network loss | Non-blocking banner; responses queue locally and flush on reconnect; timer keeps running |
| Two devices, same account | Starting a test invalidates other sessions |
| Attempt still open at 23:59 | Force-submitted and scored; marked `AUTO_SUBMITTED` |
| Browser died, row stuck open | Cleaned up by the 00:05 job and scored from persisted responses |
| Client clock altered | No effect — the server owns the clock |
| Student tries to start at 23:15:00 | Rejected server-side |
| Zero attempts on a test | Closes normally; leaderboard unchanged; archive still opens |
| Admin publishes no paper | Dashboard shows "Not scheduled"; **streaks are not broken by an admin no-show** |
| Admin takes the test | Always a dry run — never counted, never ranked |
| Wrong answer key discovered | Admin edits and rescores; the leaderboard is correct on the next page load |
| Two papers on one date | Blocked at validation — date is unique |
| Attempted = 0 | Score 0.00, accuracy shown "—", counts as participation |
| Student deactivated mid-window | Existing attempt completes and scores; no new attempt can start |
| Negative total score | Displayed honestly, e.g. `−3.25` |
| Section timer expires on question 1 | Section locks, next opens; questions 2–15 recorded as **not reached** |
| Image fails to load | Placeholder with retry; question flagged to the admin |
| Sixth student joins | Starts at 0 cumulative points; the Last-30 filter is their meaningful view |
| Only 1 student attempts | Rank reads "1st of 1" |

---

## 12. What gets measured

Deliberately small.

**The student sees, about themselves only:** score trend, sectional accuracy over time, accuracy by topic tag, skipped vs not-reached trend per section, streak.

**The admin sees:** **% correct per question** — the single statistic needed to catch a bad key — plus each attempt's score, duration and two violation counters.

**Nobody sees:** cohort averages, per-question cohort statistics, another student's timings or answers, or who has submitted tonight.

**Operational monitoring** is whatever Vercel and Supabase already provide. No custom metrics pipeline.

---

## 13. Security and privacy

- Password hashing and sessions are **Supabase Auth's responsibility**. No custom crypto.
- **FR-13.1** — Correct answers and solutions are **never sent to the client during a live test**, in any payload, including for questions already answered. The test API returns questions and options only.
- All database access is server-side with the service-role key; RLS deny-all as a backstop (FR-10.4).
- Admin routes gated by role server-side, not by route obscurity.
- Rate limits on login, response writes and PDF upload. Uploads restricted by MIME type and size.
- **Minimal PII:** a username, a display name, and a synthetic internal address that receives no mail. No real email, no phone, no address.
- **Minimal behavioural data:** two integers per attempt. No event log, no timestamps, no retention policy — there is nothing to retain. Students are told in the briefing exactly what the two counters are and that the admin can see them.
- **FR-5.3** means the privacy posture is structural: a student's data is visible to that student, to the admin, and — for the leaderboard columns only — to the cohort.

---

## 14. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **PDF extraction is lossy** — layout-heavy Quant and Reasoning parse badly | High / Likely | Rigid grammar; fail-loud validation; mandatory preview; **dry run**; image attachments; `.txt` fallback; shipped templates |
| R2 | **Admin burnout** — one person owes 55 questions a night | High / Likely | 5-minute publish target; schedule ahead; drafts; "no test tonight" does not break streaks |
| R3 | **Missed night because nobody was reminded** | Med / Likely | Admin dashboard leads with tonight's status. Accepted: no automated reminder exists — a phone alarm is the intended mitigation |
| R4 | **A wrong key corrupts scores** | High / Occasional | Rescore is P0; items below 10% correct auto-flagged; read-time leaderboard means no cache to invalidate |
| R5 | **Full-screen cannot be enforced** | Med / Certain | Stated honestly; blocking overlay; timer keeps running; counters; a trusted cohort of five |
| R6 | **Counters give no forensic detail** | Low / Certain | Accepted deliberately (§6.5). Deterrence is the goal, not prosecution |
| R7 | **Service-role key leaks into client code** | High / Occasional | One rule, FR-10.4; server-only env var; RLS deny-all backstop; a build check that the key name never appears in client bundles |
| R8 | **Cohort of five is fragile** | Med / Likely | Absolute rank not percentile; Last-30 filter |
| R9 | **Answer leakage inside the shared window** | Med / Occasional | FR-4.3 embargoes keys until 00:00; FR-13.1 keeps them off the wire |
| R10 | **Novelty decay after ~6 weeks** | Med / Likely | Streaks, podium, personal bests; the archive's "wrong answers" and "never reached" views are the retention assets |

---

## 15. Release plan

### Phase 0 — Foundation (week 1)
Supabase project and the eight tables · RLS deny-all · Supabase Auth with the synthetic-email mapping · seed script for 5 students + 1 admin · Next.js project, Tailwind, Kahoot tokens · admin shell and role gating · Asia/Kolkata time handling.

### Phase 1 — MVP (weeks 2–4) — *P0*
PDF parser, validator and preview · **dry run** · publish and schedule · the one cron job · clock-derived test status · test engine with sectional timers, palette, one-way navigation and Next Section · `was_visited` tracking · full-screen with two counters · server-authoritative timer with resume · scoring · results with absolute rank · read-time leaderboard with tie-breaks · archive with full review · three-panel dashboard · rescore · question-bank JSON export · device gate.

**Exit criteria:** a paper is uploaded, dry-run, published, taken by all 5 students, scored, ranked, and reviewable the next morning — with zero manual database intervention, for five consecutive nights.

### Phase 2 — Polish (weeks 5–6) — *P1*
Kahoot motion layer, confetti and podium · streaks · Last-30 filter · "questions I got wrong" and "questions I never reached" · pacing verdict · per-item % correct for the admin · bulk user CSV · sound toggle.

### Phase 3 — Expansion — *P2*
Computer Awareness and General Awareness as toggleable sections · disciplines beyond CSE · a second exam track · practice mode over the archive · PWA · OCR fallback · percentiles if the cohort exceeds 30.

---

## 16. Open questions

All ten questions from v1.0 and v1.1 are closed.

| Resolved | |
|---|---|
| Q1 | Owner sources the questions |
| Q2 | Cohort is 5 students + 1 admin |
| Q3 | Not reached is distinguished from skipped |
| Q4 | No Hindi variant |
| Q5 | Logging reduced to two counters — retention is moot |
| Q6 | Admin excluded from the leaderboard, by making admin attempts always dry runs |
| Q7 | The database is the question bank; Supabase daily backups plus a JSON export |
| Q8 | A sixth member starts from zero |
| Q9 | Admin gets a dry-run mode |
| Q10 | Students see nothing about each other except the leaderboard |

**Nothing is blocking the build.**

---

## Appendix A — Requirement index

`FR-3.1`–`FR-3.4` pattern, marking, not-reached · `FR-4.1`–`FR-4.3` the clock · `FR-5.1` no sign-up · `FR-5.2` admin attempts are dry runs · `FR-5.3` students see only the leaderboard · `FR-6.1.1`–`FR-6.1.4` auth · `FR-6.2.1` no public preview · `FR-6.3.1`–`FR-6.3.4` dashboard · `FR-6.4.1`–`FR-6.4.11` test engine · `FR-6.5.1`–`FR-6.5.8` integrity · `FR-6.7.1`–`FR-6.7.5` leaderboard · `FR-6.9.1`–`FR-6.9.6` admin, dry run, rescore, export · `FR-7.1`–`FR-7.2` PDF contract · `FR-8.1` no celebration mid-section · `FR-9.1` was_visited · `FR-9.2` DB is the question bank · `FR-10.1`–`FR-10.4` architecture · `FR-13.1` key confidentiality
