import { redirect } from 'next/navigation'
import { requireUser } from '../../../lib/guard'
import { db } from '../../../lib/supabase/admin'
import { loadAttempt } from '../../../lib/repo/attempts'
import { currentSessionId, revokeSessions } from '../../../lib/auth'
import { TestEngine } from '../../../components/TestEngine'
import { DeviceGate } from '../../../components/DeviceGate'

export const dynamic = 'force-dynamic'

export default async function TestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  // A student deactivated mid-window may finish this attempt (PRD §11).
  const user = await requireUser({ allowInactive: true })

  const { data: owner } = await db()
    .from('attempts').select('user_id, state').eq('id', attemptId).maybeSingle()
  if (!owner) redirect('/dashboard')
  if (owner.user_id !== user.id) redirect('/dashboard')
  if (owner.state !== 'IN_PROGRESS') redirect(`/test/${attemptId}/done`)

  // FR-6.1.4 on every open, not only at Begin: resuming on a second device
  // signs the first one out, so one attempt never runs in two places.
  // Without this session's id, revoking would sign out this device too.
  try {
    const keep = await currentSessionId()
    if (keep) await revokeSessions(user.id, keep)
  } catch (e) {
    console.error('[test] could not sign out other sessions', (e as Error).message)
  }

  const snapshot = await loadAttempt(attemptId)
  if (!snapshot) redirect('/dashboard')
  // Every section closed while they were away.
  if (snapshot.status.finished || !snapshot.section) redirect(`/test/${attemptId}/done`)

  // Keyed on the section so moving on mounts a fresh engine: the question
  // index, the responses and the queue all belong to one section, and carrying
  // them into the next would point past the end of a shorter one.
  return (
    <DeviceGate>
      <TestEngine key={snapshot.section.position} snapshot={snapshot} />
    </DeviceGate>
  )
}
