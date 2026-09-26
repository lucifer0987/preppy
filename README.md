# Preppy

Daily mock-test platform for IBPS Specialist Officer (IT) candidates. Every
night at 10 PM a 55-question paper unlocks, scored on the real marking scheme,
ranked on a leaderboard that never resets.

Closed cohort: 5 students and 1 admin. Next.js and Supabase, TypeScript
throughout. Phases 1 and 2 are complete.

## Documentation

Three documents, all in `docs/`. The two HTML files are self-contained — no
network, nothing to install. Double-click, or `open docs/architecture.html`.

| | |
|---|---|
| **[docs/architecture.html](docs/architecture.html)** | The main reference. How the system works, in eight diagrams, then setup step by step with the reasoning. Includes the full paper format. Start here |
| **[docs/setup.html](docs/setup.html)** | The same setup as a bare checklist, for when you already know what the steps do |
| **[docs/prd.html](docs/prd.html)** | What was decided, what shipped, and what changed during the build |

## Quick start

```bash
npm install
npm test          # 263 tests, no database needed
npm run dev       # http://localhost:3000
```

Login will say *Not configured yet* until you connect Supabase.
Follow **docs/architecture.html** section 13, or **docs/setup.html** for the
commands alone.

## Commands

```bash
npm run dev                    # develop
npm run build:prod             # typecheck + tests + production build
npm run build:local            # production build with source maps, for debugging
npm test                       # 263 tests
npm run check -- paper.json    # validate a paper, app not required
npm run migrate                # apply pending database migrations
npm run seed                   # create the accounts, print passwords once
```

## Layout

| Path | What |
|---|---|
| `app/` | Pages, server actions, API routes |
| `components/` | React components, including the test engine |
| `lib/` | Pure domain logic: time, scoring, ranking, the paper format |
| `lib/repo/` | The only place Supabase is called |
| `supabase/migrations/` | The schema, as a numbered chain. `npm run migrate` applies it |
| `format/` | A worked paper, a blank template, and a JSON Schema |
| `tests/` | 263 tests, including the schema run on real Postgres |
| `docs/` | The three documents above |

## The one security rule

**Never query Supabase from the browser.** Every read and write happens in
server code holding the service-role key. A file starting with `'use client'`
must not import anything under `lib/supabase/` or `lib/repo/`. Three things
enforce it: `server-only` imports, row-level security denying everything by
default, and a bundle scan that fails the build.

## Known limit

The schema and its SQL functions are tested against real Postgres. The layer
that talks to Supabase over the network — the queries in `lib/repo/`, signing
in, and reading an image out of Storage — has never run. **docs/architecture.html
section 17** is a ten-minute walkthrough that exercises nearly all of it. Do
that before a paper night that counts.







Passwords are shown once. Copy them now.

  USERNAME    ROLE     PASSWORD
  -----------------------------------
  admin       admin    d5cm-m1dr-rbfx
  student1    student  g6zs-qww7-wj72
  student2    student  sykz-kdea-rnbs
  student3    student  665k-1f45-y5rh
  student4    student  2kbq-qgqm-03gr
  student5    student  28a2-pp10-kvvs