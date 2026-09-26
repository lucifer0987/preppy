#!/usr/bin/env tsx
/**
 * Checks the environment before a build, so a missing or wrong key fails here
 * with an instruction rather than three layers down at runtime.
 *
 *   tsx scripts/preflight.ts local
 *   tsx scripts/preflight.ts prod
 */

type Target = 'local' | 'prod'

/** What a key of each kind looks like, current generation and legacy. */
const PUBLISHABLE = /^sb_publishable_/
const SECRET = /^sb_secret_/
const LEGACY_JWT = /^eyJ/

interface Check {
  name: string
  /**
   * An older name for the same thing, still accepted. Supabase is replacing
   * `anon` and `service_role` with publishable and secret keys; both work today,
   * so an .env.local written before the change keeps building.
   */
  legacy?: string
  required: Target[]
  where: string
  /** `name` is whichever variable actually supplied the value. */
  validate?: (value: string, name: string) => string | null
}

const CHECKS: Check[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: ['local', 'prod'],
    where: 'the "Connect" button at the top of the dashboard, or Settings -> API Keys',
    validate: (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(v)
        ? null
        : 'That does not look like a Supabase project URL (https://xxxx.supabase.co).',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    legacy: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: ['local', 'prod'],
    where: 'Supabase -> Settings -> API Keys -> the publishable key (sb_publishable_...)',
    validate: (v, name) => {
      // The one that matters. Anything in a NEXT_PUBLIC_ variable is compiled
      // into the JavaScript the browser downloads, so a secret key here is
      // published to the world, and nothing later in the build would notice.
      if (SECRET.test(v)) {
        return 'that is a SECRET key (sb_secret_...), and this variable is sent to the browser.\n'
          + `      Put it in SUPABASE_SECRET_KEY instead, and put the publishable key here.\n`
          + '      If this key has been in a build or a commit, rotate it in the dashboard.'
      }
      if (name.endsWith('PUBLISHABLE_KEY') && !PUBLISHABLE.test(v) && !LEGACY_JWT.test(v)) {
        return 'that does not look like a publishable key. Expect sb_publishable_... '
          + '(or a legacy anon key, a long string starting eyJ).'
      }
      if (v.length <= 30) return 'that key looks too short to be real.'
      return null
    },
  },
  {
    name: 'SUPABASE_SECRET_KEY',
    legacy: 'SUPABASE_SERVICE_ROLE_KEY',
    required: ['local', 'prod'],
    where: 'Supabase -> Settings -> API Keys -> a secret key (sb_secret_...). Keep it secret',
    validate: (v) => {
      if (PUBLISHABLE.test(v)) {
        return 'that is the publishable key, which cannot do the work this one does.\n'
          + '      Create a secret key (sb_secret_...) on the same page.'
      }
      if (!SECRET.test(v) && !LEGACY_JWT.test(v)) {
        return 'that does not look like a secret key. Expect sb_secret_... '
          + '(or a legacy service_role key, a long string starting eyJ).'
      }
      if (v.length <= 30) return 'that key looks too short to be real.'
      return null
    },
  },
  {
    name: 'CRON_SECRET',
    // Locally the nightly job is optional: an abandoned attempt is also scored
    // the next time anyone opens it. In production the job must be able to run.
    required: ['prod'],
    where: 'Any random string. Generate one with: npm run secret',
    validate: (v) => (v.length >= 16 ? null : 'use at least 16 characters.'),
  },
]

const target = (process.argv[2] ?? 'local') as Target
if (target !== 'local' && target !== 'prod') {
  console.error('usage: tsx scripts/preflight.ts <local|prod>')
  process.exit(2)
}

const problems: string[] = []
const warnings: string[] = []

/**
 * The first variable with a real value, and which one it was.
 *
 * A blank counts as absent. `??` would not do: `.env.example` ships the
 * alternative names as blank lines, and `'' ?? legacy` is `''` -- so a blank
 * current name would shadow a perfectly good legacy key and this would report it
 * missing. lib/env.ts uses the same rule, and the two must agree or a build
 * passes here and the app throws at runtime.
 */
function resolve(check: Check): { value: string; from: string } | null {
  for (const name of [check.name, check.legacy]) {
    if (!name) continue
    const raw = process.env[name]
    if (raw && raw.trim() !== '') return { value: raw.trim(), from: name }
  }
  return null
}

for (const check of CHECKS) {
  const found = resolve(check)
  const needed = check.required.includes(target)

  if (!found) {
    const names = check.legacy ? `${check.name} (or ${check.legacy})` : check.name
    if (needed) problems.push(`${names} is missing.\n      Find it at: ${check.where}`)
    else warnings.push(`${check.name} is not set. ${optionalNote(check.name)}`)
    continue
  }

  const bad = check.validate?.(found.value, found.from)
  // Named by the variable that actually holds it, not by the preferred name, or
  // the message sends you to edit a line you never filled in.
  if (bad) problems.push(`${found.from}: ${bad}`)
}

function optionalNote(name: string): string {
  if (name === 'CRON_SECRET') {
    return 'The nightly job cannot run, which is fine locally: an attempt left open is scored the next time anyone opens it.'
  }
  return 'Optional for this target.'
}

const label = target === 'prod' ? 'production' : 'local'

if (problems.length) {
  console.error(`\n  Cannot build for ${label}. ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`)
  for (const p of problems) console.error(`    - ${p}\n`)
  console.error(`  These live in .env.local for a local build, or in your host's`)
  console.error(`  environment settings for production. See docs/architecture.html.\n`)
  process.exit(1)
}

console.log(`  preflight (${label}): environment looks right.`)
for (const w of warnings) console.log(`    note: ${w}`)
