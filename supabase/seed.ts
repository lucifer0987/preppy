#!/usr/bin/env tsx
/**
 * Creates the cohort: 5 students + 1 admin (PRD section 1.3).
 *
 *   npm run seed              create any missing accounts
 *   npm run seed -- --reset   also reset passwords on accounts that exist
 *
 * Usernames map to <username>@preppy.local, a synthetic address that never
 * receives mail. Passwords are generated here and printed once — there is no
 * email to send them to, so copy them before closing the terminal.
 */
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const COHORT = [
  { username: 'admin', displayName: 'Admin', role: 'admin' as const },
  { username: 'student1', displayName: 'Student One', role: 'student' as const },
  { username: 'student2', displayName: 'Student Two', role: 'student' as const },
  { username: 'student3', displayName: 'Student Three', role: 'student' as const },
  { username: 'student4', displayName: 'Student Four', role: 'student' as const },
  { username: 'student5', displayName: 'Student Five', role: 'student' as const },
]

/** Readable but not guessable: two short words plus digits. */
function makePassword(): string {
  const words = ['quant', 'rank', 'score', 'timer', 'paper', 'streak', 'mock', 'logic']
  const pick = () => words[randomBytes(1)[0]! % words.length]
  return `${pick()}-${pick()}-${randomBytes(2).toString('hex')}`
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Put them in .env.local, then run:  npm run seed\n' +
      'See SETUP.md.',
    )
    process.exit(2)
  }

  const reset = process.argv.includes('--reset')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const created: { username: string; password: string; role: string }[] = []

  for (const person of COHORT) {
    const email = `${person.username}@preppy.local`
    const password = makePassword()

    const { data: existing } = await admin
      .from('profiles').select('id').eq('username', person.username).maybeSingle()

    if (existing) {
      if (!reset) { console.log(`  exists   ${person.username}`); continue }
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
      if (error) { console.error(`  FAILED   ${person.username}: ${error.message}`); continue }
      await admin.from('profiles').update({ must_change_password: true }).eq('id', existing.id)
      created.push({ ...person, password })
      console.log(`  reset    ${person.username}`)
      continue
    }

    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (error || !data.user) {
      console.error(`  FAILED   ${person.username}: ${error?.message ?? 'no user returned'}`)
      continue
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: data.user.id,
      username: person.username,
      display_name: person.displayName,
      role: person.role,
      must_change_password: true,
    })
    if (profileError) {
      // Leave no auth user without a profile, or login would half-work.
      await admin.auth.admin.deleteUser(data.user.id)
      console.error(`  FAILED   ${person.username}: ${profileError.message}`)
      continue
    }

    created.push({ ...person, password })
    console.log(`  created  ${person.username}`)
  }

  if (!created.length) {
    console.log('\nNothing to do. Use --reset to set fresh passwords.\n')
    return
  }

  console.log('\n  Passwords are shown once. Copy them now.\n')
  console.log(`  ${'USERNAME'.padEnd(12)}${'ROLE'.padEnd(9)}PASSWORD`)
  console.log(`  ${'-'.repeat(12)}${'-'.repeat(9)}${'-'.repeat(22)}`)
  for (const c of created) {
    console.log(`  ${c.username.padEnd(12)}${c.role.padEnd(9)}${c.password}`)
  }
  console.log('\n  Everyone must change their password on first login.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
