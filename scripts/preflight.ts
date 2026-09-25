#!/usr/bin/env tsx
/**
 * Checks the environment before a build, so a missing key fails here with an
 * instruction rather than three layers down at runtime.
 *
 *   tsx scripts/preflight.ts local
 *   tsx scripts/preflight.ts prod
 */

type Target = 'local' | 'prod'

interface Check {
  name: string
  required: Target[]
  where: string
  validate?: (value: string) => string | null
}

const CHECKS: Check[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: ['local', 'prod'],
    where: 'Supabase -> Settings -> API -> Project URL',
    validate: (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(v)
        ? null
        : 'That does not look like a Supabase project URL (https://xxxx.supabase.co).',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: ['local', 'prod'],
    where: 'Supabase -> Settings -> API -> anon public',
    validate: (v) => (v.length > 30 ? null : 'That key looks too short to be real.'),
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    required: ['local', 'prod'],
    where: 'Supabase -> Settings -> API -> service_role (keep secret)',
    validate: (v) => (v.length > 30 ? null : 'That key looks too short to be real.'),
  },
  {
    name: 'CRON_SECRET',
    // Locally the nightly job is optional: an abandoned attempt is also scored
    // the next time anyone opens it. In production the job must be able to run.
    required: ['prod'],
    where: 'Any random string. Generate one with: npm run secret',
    validate: (v) => (v.length >= 16 ? null : 'Use at least 16 characters.'),
  },
]

const target = (process.argv[2] ?? 'local') as Target
if (target !== 'local' && target !== 'prod') {
  console.error('usage: tsx scripts/preflight.ts <local|prod>')
  process.exit(2)
}

const problems: string[] = []
const warnings: string[] = []

for (const check of CHECKS) {
  const value = (process.env[check.name] ?? '').trim()
  const needed = check.required.includes(target)

  if (!value) {
    if (needed) problems.push(`${check.name} is missing.\n      Find it at: ${check.where}`)
    else warnings.push(`${check.name} is not set. ${optionalNote(check.name)}`)
    continue
  }
  const bad = check.validate?.(value)
  if (bad) problems.push(`${check.name}: ${bad}`)
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
