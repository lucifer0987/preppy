# Preppy

Daily exam-simulation platform for IBPS Specialist Officer (IT) aspirants.
Full documentation is in **[docs/](docs/)**.

**Status:** Phases 1 and 2 complete. Ingestion, the test engine, results, the
leaderboard, the archive, rescore, user management, the nightly job, the
question-bank export, the Kahoot motion layer, the attempts table, bulk CSV
import, the sound toggle and self-service password change all work.

Nothing has been run against a live database yet — see *Known limit* below.

## Documentation

Everything is in **[docs/](docs/)**:

| | |
|---|---|
| **[docs/architecture.html](docs/architecture.html)** | How it is built, in diagrams, then setup step by step. Open in a browser |
| **[docs/prd.html](docs/prd.html)** | What was decided and what shipped |
| **[docs/setup.md](docs/setup.md)** | The setup commands, as a checklist |

## Getting started

New here? Open **[docs/architecture.html](docs/architecture.html)** and follow
section 13. It walks through Supabase, the schema, the keys and the seed, and
says how to tell each step worked.

```bash
npm install
npm run dev          # http://localhost:3000
npm run seed         # create 5 students + 1 admin
npm test
```

## The paper format

One paper per night, as a single JSON file.
The format is fixed — see **[format/README.md](format/README.md)**.

```bash
npm install
npm run check -- format/sample.json    # check a paper
```

Exit `0` publishable, `1` blocking errors, `2` bad usage.

| Path | Purpose |
|---|---|
| `format/README.md` | The format spec, written for whoever makes the papers |
| `format/schema.json` | JSON Schema — point your editor at it for live validation |
| `format/template.json` | Fill-in skeleton, all 55 questions numbered correctly |
| `format/sample.json` | A worked paper: DI table, seating puzzle, RC passage |
| `lib/types.ts` | The pattern constants and paper shapes |
| `lib/json-error.ts` | Turns a JSON parse failure into a line and column |
| `lib/images.ts` / `lib/repo/images.ts` | Paper image rules, and their private Storage bucket |
| `app/api/images/` | Serves an image only to someone allowed to see its paper |
| `lib/password.ts` | Generated passwords, shared by the seed and the admin console |
| `lib/rate-limit.ts` / `lib/repo/rate-limit.ts` | Rate limits on login, answer saves and uploads, counted in the database |
| `lib/paper.ts` | Validation: blocking errors vs warnings, each with a path |
| `scripts/parse.ts` | The checker CLI |
| `scripts/build-format.ts` | Regenerates the template |
| `supabase/schema.sql` | Eight tables plus `rate_limits`, RLS deny-all on every one, and the functions that make multi-step writes all or nothing |
| `supabase/seed.ts` | Creates the cohort and prints passwords once |
| `lib/time.ts` | The IST clock: window state derived on read, never stored |
| `lib/auth.ts` | Username+password over Supabase Auth, synthetic-email mapping |
| `lib/supabase/admin.ts` | The only client that touches data. Server-only |
| `lib/attempt.ts` | Sectional timer state machine. Pure, server-authoritative |
| `lib/scoring.ts` | +1 / −0.25 / 0, and not-reached vs skipped |
| `lib/leaderboard.ts` | Cumulative ranking with tie-breaks and streaks. Pure |
| `lib/repo/` | The thin IO layer over Supabase |
| `scripts/check-bundle.ts` | Runs after `next build`: fails it if the service-role key reaches the browser (risk R7) |
| `tests/schema.test.ts` | Runs `schema.sql` on a real Postgres (PGlite) and exercises every function and guard |
| `lib/repo/rescore.ts` | Correcting a key and rescoring every attempt |
| `lib/repo/finalise.ts` | The one nightly job: score anything left open |
| `vercel.json` | Schedules that job at 00:05 IST (18:35 UTC) |
| `components/motion.ts` | The one place that answers "may this animate?" |
| `components/sound.ts` | Synthesised tones; off by default, never mid-section |
| `lib/username.ts` | Pure username rules, free of any server-only import |
| `lib/csv.ts` | Bulk-import parsing, pure and tested |
| `lib/guard.ts` | Page guards, including the must-change-password gate |
| `components/TestEngine.tsx` | The live test: palette, timers, full-screen |
| `app/` | Home, login, dashboard, test, archive, leaderboard, admin |

## Commands

```bash
npm run check -- <paper.json>   # validate; add --images <dir> or --json
npm run build:format            # regenerate format/template.json
npm test
```

## Known limits

**No database has been exercised.** Every query typechecks and the pure logic
around it is covered by 232 tests, but nothing here has run against a live
Postgres. Follow docs/architecture.html section 17 before relying on it.
