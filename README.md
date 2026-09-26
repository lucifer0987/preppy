# Preppy

Daily mock-test platform for IBPS Specialist Officer (IT) candidates. A paper
unlocks in a window you set when you schedule it — a day may hold more than one
— scored on the real marking scheme, ranked on a leaderboard that never resets.

Out of the box a paper is 55 questions in 45 minutes at +1 / −0.25, matching the
exam. Questions, minutes and marking are set per section and configurable, from
the admin console or in the paper's own file.

Closed cohort: 5 students and 1 admin. Next.js and Supabase, TypeScript
throughout. Phases 1 and 2 are complete.

## Documentation

Three documents, all in `docs/`. The two HTML files are self-contained — no
network, nothing to install. Double-click, or `open docs/architecture.html`.

| | |
|---|---|
| **[docs/architecture.html](docs/architecture.html)** | The main reference. How the system works, in eight diagrams, then setup step by step with the reasoning. Includes the full paper format and the design system. Start here |
| **[docs/setup.html](docs/setup.html)** | The same setup as a bare checklist, for when you already know what the steps do |
| **[docs/prd.html](docs/prd.html)** | What was decided, what shipped, and what changed during the build |

## Quick start

```bash
npm install
npm test          # 374 tests, no database needed
npm run dev       # http://localhost:3000
```

Login will say *Not configured yet* until you connect Supabase.
Follow **docs/architecture.html** section 14, or **docs/setup.html** for the
commands alone.

## Commands

Every script in `package.json`. The `--` before a flag is npm's own: it means
"pass the rest through to the script".

```bash
# every day
npm run dev                     # dev server on :3000, reloads as you edit
npm test                        # 374 tests, no database needed
npm run typecheck               # types only, no build

# the database
npm run migrate                 # apply pending migrations — run after pulling
npm run migrate -- --status     # what has landed and what has not; changes nothing
npm run migrate -- --print      # print the SQL instead, to paste into Supabase
npm run seed                    # create missing accounts, print passwords ONCE
npm run seed -- --reset         # new passwords for all six, and sign every device out

# papers
npm run check -- paper.json     # validate a paper file; app not required
npm run build:format            # rewrite format/template.json from the shipped pattern

# builds
npm run build:local             # preflight + build, source maps kept, for debugging
npm run start:local             # serve that build
npm run build:prod              # preflight + typecheck + tests + build, no source maps
npm run start:prod              # serve the production build
npm run build                   # alias for build:prod — this is what Vercel runs
npm run start                   # alias for start:prod

# odds and ends
npm run secret                  # a random string for CRON_SECRET
```

Two useful things that are not scripts:

```bash
npx tsx --env-file=.env.local scripts/preflight.ts local   # is .env.local right?
npx tsx scripts/check-bundle.ts                            # scan an existing build
```

## Layout

| Path | What |
|---|---|
| `app/` | Pages, server actions, API routes |
| `components/` | React components, including the test engine, the app shell and the wordmark |
| `lib/` | Pure domain logic: time, scoring, ranking, the paper format |
| `lib/repo/` | The only place Supabase is called |
| `supabase/migrations/` | The schema, in two numbered files: `0001_baseline.sql` and everything since. `npm run migrate` applies whatever your database is missing |
| `format/` | A worked paper, a blank template, and a JSON Schema. Both papers state their own shape, so they keep validating whatever the default pattern is set to |
| `tests/` | 374 tests, including the schema run on real Postgres |
| `docs/` | The three documents above |

## The look

Violet and gold, Archivo for display and IBM Plex Sans for anything you actually
read, and the four answer shapes as the wordmark. Dark mode follows your
operating system.

Colours are never written literally. `app/globals.css` holds raw scales that
never change plus a semantic layer — `--surface`, `--text`, `--accent` — that
does, and components address only the semantic names. **Never use `bg-white`,
`border-black/10` or a hex literal:** each is a light card on a dark page.
**docs/architecture.html section 11** is the whole system.

## The one security rule

**Never query Supabase from the browser.** Every read and write happens in
server code holding the **secret key** — `sb_secret_…`, or the legacy
`service_role` key it replaces. A file starting with `'use client'` must not
import anything under `lib/supabase/` or `lib/repo/`; it may import a *type*
from there, because type imports are erased before anything is bundled.

Three things enforce it: `server-only` imports, row-level security denying
everything by default, and a bundle scan that fails the build if the key or its
name appears in `.next/static`.

The browser does hold the **publishable key** (`sb_publishable_…`, formerly
`anon`). That is by design and safe: with deny-all policies on every table it
reads nothing on its own.

## Known limit

The schema and its SQL functions are tested against real Postgres. The layer
that talks to Supabase over the network — the queries in `lib/repo/`, signing
in, and reading an image out of Storage — has never run. **docs/architecture.html
section 18** is a ten-minute walkthrough that exercises nearly all of it. Do
that before a paper night that counts.

Three bugs of one shape have already come out of that layer, all found by
reading: a query selecting fewer columns than the code then read off the row.
Hence the rule — **never cast a database row to a shape wider than the columns
you selected.** Windows are built through `paperWindowOf`, which throws rather
than handing back one nobody can use.
