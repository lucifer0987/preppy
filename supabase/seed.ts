#!/usr/bin/env tsx
/**
 * Creates the cohort: 5 students + 1 admin (PRD section 1.3).
 *
 *   npm run seed              create any missing accounts
 *   npm run seed -- --reset   also reset passwords on accounts that exist,
 *                             reactivate them and sign out every session
 *
 * Usernames map to <username>@preppy.local, a synthetic address that never
 * receives mail. Passwords are generated here and printed once — there is no
 * email to send them to, so copy them before closing the terminal.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { firstSet } from '../lib/env'
import { generatePassword } from '../lib/password'
import { usernameToEmail } from '../lib/username'

const COHORT = [
  { username: 'admin', displayName: 'Admin', role: 'admin' as const },
  { username: 'student1', displayName: 'Student One', role: 'student' as const },
  { username: 'student2', displayName: 'Student Two', role: 'student' as const },
  { username: 'student3', displayName: 'Student Three', role: 'student' as const },
  { username: 'student4', displayName: 'Student Four', role: 'student' as const },
  { username: 'student5', displayName: 'Student Five', role: 'student' as const },
]

/**
 * An auth user with this email, found by paging through the admin listing
 * (there is no lookup by email). Six accounts make this one short page.
 */
async function findAuthUser(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Could not list auth users: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email)
    if (hit) return hit
    if (data.users.length < perPage) return null
  }
}

/**
 * The exam a new student is put on: the first active track, else the first.
 *
 * The same rule as defaultTrack() in lib/repo/tracks.ts, repeated here rather
 * than imported because that module is server-only and this is a script.
 *
 * A student with no track is not broken -- viewerTrack falls back to this very
 * track -- but it is only invisible while there is one exam. With two, a
 * trackless student silently lands on whichever happens to be default, and the
 * leaderboard marks the wrong one as theirs. So it is set at creation.
 */
async function defaultTrackId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from('tracks').select('id, is_active').order('position')
  if (error || !data?.length) return null
  return (data.find((t) => t.is_active) ?? data[0])!.id as string
}

/** Signs an account out everywhere (revoke_user_sessions in supabase/migrations). */
async function endSessions(admin: SupabaseClient, userId: string, username: string) {
  const { error } = await admin.rpc('revoke_user_sessions', { p_user: userId })
  if (error) console.error(`  WARNING  ${username}: sessions not ended (${error.message}). Run 'npm run migrate' first.`)
}

async function main() {
  // firstSet, not ??: .env.example ships the alternative names as blank lines,
  // and a blank would otherwise shadow the name that does have the key in it.
  const url = firstSet(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const secretKey = firstSet(process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !secretKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).\n' +
      'Both are on Supabase -> Settings -> API Keys. Put them in .env.local, then:\n' +
      '  npm run seed\n' +
      'See docs/setup.html.',
    )
    process.exit(2)
  }

  const reset = process.argv.includes('--reset')
  const admin = createClient(url, secretKey, { auth: { persistSession: false } })
  const created: { username: string; password: string; role: string }[] = []

  // Read once: every student created below goes on the same exam, and an admin
  // goes on none -- they run all of them.
  const trackId = await defaultTrackId(admin)
  if (!trackId) {
    console.error('  WARNING  no exam track found, so students will be created without one.')
    console.error("           Run 'npm run migrate' first if this is a new database.")
  }

  for (const person of COHORT) {
    const email = usernameToEmail(person.username)
    const password = generatePassword()

    const { data: existing } = await admin
      .from('profiles').select('id').eq('username', person.username).maybeSingle()

    if (existing) {
      if (!reset) { console.log(`  exists   ${person.username}`); continue }
      // A reset is a clean slate: new password, active again, and every
      // session ended (the same as an admin reset in the app).
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
      if (error) { console.error(`  FAILED   ${person.username}: ${error.message}`); continue }
      await admin.from('profiles')
        .update({ must_change_password: true, is_active: true }).eq('id', existing.id)
      await endSessions(admin, existing.id, person.username)
      created.push({ ...person, password })
      console.log(`  reset    ${person.username}`)
      continue
    }

    // An auth user with no profile is left behind when a profile is deleted
    // by hand, or a past run died between the two inserts. Creating it again
    // would fail forever on the duplicate email, so adopt it instead: give it
    // a fresh password and end its sessions, since nobody knows the old one.
    let userId: string
    let adopted = false
    const orphan = await findAuthUser(admin, email)
    if (orphan) {
      const { error } = await admin.auth.admin.updateUserById(orphan.id, { password })
      if (error) { console.error(`  FAILED   ${person.username}: ${error.message}`); continue }
      await endSessions(admin, orphan.id, person.username)
      userId = orphan.id
      adopted = true
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      })
      if (error || !data.user) {
        console.error(`  FAILED   ${person.username}: ${error?.message ?? 'no user returned'}`)
        continue
      }
      userId = data.user.id
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: userId,
      username: person.username,
      display_name: person.displayName,
      role: person.role,
      must_change_password: true,
      track_id: person.role === 'student' ? trackId : null,
    })
    if (profileError) {
      // Leave no auth user without a profile, or login would half-work. An
      // adopted one is left for the next run to adopt again.
      if (!adopted) await admin.auth.admin.deleteUser(userId)
      console.error(`  FAILED   ${person.username}: ${profileError.message}`)
      continue
    }

    created.push({ ...person, password })
    console.log(`  ${adopted ? 'adopted' : 'created'}  ${person.username}`)
  }

  if (!created.length) {
    console.log('\nNothing to do. Use --reset to set fresh passwords.\n')
    return
  }

  console.log('\n  Passwords are shown once. Copy them now.\n')
  console.log(`  ${'USERNAME'.padEnd(12)}${'ROLE'.padEnd(9)}PASSWORD`)
  console.log(`  ${'-'.repeat(12)}${'-'.repeat(9)}${'-'.repeat(14)}`)
  for (const c of created) {
    console.log(`  ${c.username.padEnd(12)}${c.role.padEnd(9)}${c.password}`)
  }
  console.log('\n  Everyone must change their password on first login.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
