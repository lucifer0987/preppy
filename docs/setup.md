# Setup checklist

The command sequence, nothing else. For what each step *does*, why, and how to
tell it worked, open **[architecture.html](architecture.html)** in a browser —
sections 12 to 16.

---

## First time, local

```bash
node -v                 # needs v20 or newer
npm install
npm test                # 263 passing means the code is sound
```

Then, in the Supabase dashboard:

1. **New project**, named `preppy-dev`, nearest region.
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
   Expect `Success. No rows returned`, and nine tables with RLS badges.
3. **Authentication → Sign In / Providers → Email** → turn **Confirm email**
   off. Skipping this makes every login fail as if the password were wrong.

Back in the terminal:

```bash
cp .env.example .env.local
# fill in the three values from Supabase → Settings → API:
#   NEXT_PUBLIC_SUPABASE_URL        Project URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY   anon public
#   SUPABASE_SERVICE_ROLE_KEY       service_role   (secret)

npx tsx --env-file=.env.local scripts/preflight.ts local   # verifies the keys
npm run seed                                               # prints passwords ONCE
npm run dev                                                # localhost:3000
```

## Every day

```bash
npm run dev
```

Restart it after editing `.env.local` — env changes are not picked up live.

## Before shipping

```bash
npm run build:prod      # preflight + typecheck + 263 tests + build
git add -A && git commit -m "..."
git push                # Vercel deploys
```

## First time, production

A **second** Supabase project, `preppy-prod`. Never point your laptop at it.

1. Same three dashboard steps as above, in the new project.
2. `npm run secret` → copy the value.
3. Push to GitHub, import into Vercel.
4. In Vercel → Environment Variables, add four, all from **preppy-prod**:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
5. Deploy. Check **Settings → Cron Jobs** shows `/api/cron/finalise` at
   `35 18 * * *` (18:35 UTC = 00:05 IST).
6. Seed production once:
   ```bash
   # .env.prod.local holds the PRODUCTION url + service-role key
   npx tsx --env-file=.env.prod.local supabase/seed.ts
   rm .env.prod.local
   ```

## Other commands

```bash
npm run check <paper.json>   # validate a paper, app not needed
npm run seed -- --reset      # fresh passwords for everyone
npm run typecheck
npm run build:local          # production build with source maps, for debugging
npm run start:local
```

## When something is wrong

| Symptom | Fix |
|---|---|
| "Not configured yet" | `.env.local` incomplete, or the server needs restarting |
| Login rejects a correct password | Email confirmation is still on |
| Build says "Cannot build for production" | It names the missing variable |
| Seeding errors | Tables missing — re-run `supabase/schema.sql` |
| Nightly job did not run | Admin home → **Finalise open attempts now** |

Fuller list in architecture.html, section 18.
