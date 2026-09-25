> **A fuller guide with diagrams lives in [docs/architecture.html](docs/architecture.html)** —
> open it in a browser. It covers the same setup plus how the system works
> and what to do when something breaks. This file is the short version.

# Setting up Preppy

Written for someone who does not write web code. Follow it top to bottom once;
after that, `npm run dev` is all you need.

You will need: Node 22 or newer, and a free Supabase account.

---

## 1. Install

```bash
npm install
```

## 2. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project**. Name it `preppy`. Choose the region closest to you
   (Mumbai / `ap-south-1` if it is offered).
3. Set a database password and save it somewhere. You will not need it often,
   but you cannot recover it.
4. Wait for the project to finish provisioning, about two minutes.

## 3. Create the tables

1. In the Supabase dashboard, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase/schema.sql` from this repo, copy all of it, paste it in.
4. Click **Run**.

You should see `Success. No rows returned`. That built all eight tables and
locked them down.

To confirm: open **Table Editor**. You should see `profiles`, `tests`,
`sections`, `direction_blocks`, `questions`, `attempts`, `attempt_sections`
and `responses`. Each will show a **RLS enabled** badge. That is intentional.

Paper images need no setup: the app creates a private Storage bucket called
`paper-images` the first time a paper with images is uploaded.

## 4. Copy your keys

1. In Supabase, go to **Settings** (gear icon) then **API**.
2. Create `.env.local` in this folder:

```bash
cp .env.example .env.local
```

3. Fill in the three values:

| In `.env.local` | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → Project API keys → **anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → Project API keys → **service_role** |
| `CRON_SECRET` | Any random string you invent. See step 8 |

> **The `service_role` key is a master key.** It bypasses every access rule in
> the database. It belongs only in `.env.local`, which is already in
> `.gitignore`. Never paste it into a chat, a browser console, or any file
> under `app/` or `components/`.

## 5. Turn off email confirmation

Preppy has no email addresses — usernames map to a synthetic internal address
that never receives mail. So Supabase must not wait for confirmations.

1. **Authentication** → **Sign In / Providers** → **Email**.
2. Turn **Confirm email** off.
3. Save.

## 6. Create the cohort

```bash
npm run seed
```

This creates six accounts: `admin` plus `student1` through `student5`. It
prints each password **once**. Copy them now and hand them out — there is no
email to send them to, and no way to recover them later.

Everyone is made to choose their own password the first time they log in.
Until they do, nothing else in the app is reachable.

To add people later, use **People** in the admin console — one at a time, or
several at once by pasting a CSV.

To set fresh passwords at any time:

```bash
npm run seed -- --reset
```

A reset also reactivates each account and signs out every session it had, on
every device. If an earlier run left a login with no profile behind (it prints
`adopted`), the seed takes it over with a fresh password instead of failing on
the duplicate.

Passwords look like `k7qm-3xtr-9hwp`: easy to read out, about 60 bits.

## 7. Set a cron secret

One job runs nightly, at 00:05, to score any attempt somebody left open. The
endpoint writes scores, so it is locked behind a secret.

Generate one and put it in `.env.local` as `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Locally you do not need the job at all — an abandoned attempt is also scored
the next time anyone loads it. On Vercel, add the same value under
**Settings → Environment Variables**, and `vercel.json` schedules the rest.

> The schedule reads `35 18 * * *` because Vercel Cron runs on UTC.
> 18:35 UTC is 00:05 IST.
>
> **If `CRON_SECRET` is not set, the endpoint refuses everyone**, including
> Vercel. That is deliberate — better a job that does not run than an open
> endpoint that writes scores — but it does mean you must set it in production.

## 8. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the countdown to 10 PM.
Log in as `admin` to reach the admin page, or as any student for the dashboard.

---

## What works now

**For a student**

- The home page, with a live countdown to the next 10 PM unlock
- Username and password login
- A dashboard that knows whether tonight's paper is live, already taken, or
  past its entry cut-off, with your recent papers and the leaderboard inline
- The full test: sectional timers, the question palette, one-way section
  navigation, full screen with the two counters, and resume after a refresh
- A result page the moment you submit: the score, the sectional breakdown, the
  pacing verdict and your slowest questions. Your rank and leaderboard move
  appear at 12:01 AM, when the board takes in the night's paper
- Past papers, with answers, solutions and your time per question from
  midnight, filterable by section and to the ones you got wrong or never reached
- The leaderboard, with All time, Last 7, Last 30 and any one paper's rank
  list, refreshed at 12:01 AM each night
- Confetti on a personal best, an animated podium, and streak badges
- A sound toggle, off by default, which never plays during a section
- Changing their own password

**For you**

- Upload a paper with its images, see the validation report, preview every
  question exactly as a student sees it, then schedule it
- Dry run any paper in the real engine; it never counts, and can be deleted
- Correct an answer key after the fact, which rescores every attempt
- A flag on any question under 10% correct, which is usually a wrong key
- Create people one at a time or in bulk from a CSV, reset passwords, deactivate
- An attempts table with scores, durations and the two integrity counters, and
  any one student's full history
- Export the whole question bank as JSON

## What is left

Nothing in Phase 1 or Phase 2. Phase 3 is other sections, other disciplines, a
second exam track and practice mode.

Paper ingestion also works from the command line, without the app running:

```bash
npm run check format/sample.json
```

---

## The one rule

**Never query Supabase from the browser.**

Every database read and write happens in server code using the service-role
key. Row Level Security is switched on for every table with no permissive
policy, so even if the `anon` key leaked, it reads nothing.

In practice: if you add a file under `app/` or `components/` that starts with
`'use client'`, it must not import anything from `lib/supabase/`. The
`server-only` marker in those files turns that mistake into a build error
rather than a leak.

## Troubleshooting

**"Not configured yet" on the login page**
`.env.local` is missing or incomplete. Check all three values, then restart
`npm run dev` — environment changes are not picked up while it is running.

**`npm run seed` says "Missing NEXT_PUBLIC_SUPABASE_URL"**
Same cause. The seed script reads `.env.local` directly.

**Seeding fails with "Database error creating new user"**
The tables are missing. Re-run step 3.

**Login says "Too many failed attempts"**
Five wrong passwords on one account, or twenty from one network, lock that
account or address out for 15 minutes. The count lives in the running server's
memory, so restarting `npm run dev` clears it; on Vercel each server instance
counts separately.

**Someone was signed out unexpectedly**
Expected after an admin password reset, a reactivation, or their own password
change on another device: each of those ends the account's other sessions.

**Login always says "Wrong username or password"**
Either the password is wrong, or email confirmation is still on. Re-check
step 5, then `npm run seed -- --reset`.

**A student can reach `/admin`**
They cannot — every admin page and every admin action checks the role on the
server for itself (`lib/guard.ts`); the layout's check is not relied on. If you
see otherwise, that is a bug worth reporting.

**Starting a test does not sign the account out on another device**
Signing out other devices is done by a database function,
`revoke_user_sessions`, that deletes the account's Supabase sessions. If your
project does not allow it, `npm run seed -- --reset` prints
`WARNING ... sessions not ended`, and the app falls back to Supabase's own
"sign out other sessions", which takes effect within an hour rather than at
once. Re-run `supabase/schema.sql` in the SQL editor (as the default
`postgres` user) and try again.
