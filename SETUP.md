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

To set fresh passwords at any time:

```bash
npm run seed -- --reset
```

## 7. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the countdown to 10 PM.
Log in as `admin` to reach the admin page, or as any student for the dashboard.

---

## What works now

- The home page, with a live countdown to the next 10 PM unlock
- Username and password login, and logout
- The student dashboard shell, showing whether a paper is live
- The admin area, gated by role — a student who types `/admin` is turned away
- Tonight's status on the admin page: **Scheduled** or **Not scheduled**

## What does not exist yet

The test engine, uploading a paper, scoring, the leaderboard and the archive.
Those are Phase 1. The panels that say *Phase 1* are placeholders.

Paper ingestion already works from the command line:

```bash
npm run check format/paper-002.pdf
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

**Login always says "Wrong username or password"**
Either the password is wrong, or email confirmation is still on. Re-check
step 5, then `npm run seed -- --reset`.

**A student can reach `/admin`**
They cannot — the role check is in `app/admin/layout.tsx` and runs on the
server for every page in that section. If you see otherwise, that is a bug
worth reporting.
