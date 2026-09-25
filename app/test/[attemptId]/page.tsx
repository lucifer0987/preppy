import { redirect } from 'next/navigation'
import { currentUser } from '../../../lib/auth'
import { db } from '../../../lib/supabase/admin'
import { loadAttempt } from '../../../lib/repo/attempts'
import { TestEngine } from '../../../components/TestEngine'
import { DeviceGate } from '../../../components/DeviceGate'

export const dynamic = 'force-dynamic'

export default async function TestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const user = await currentUser()
  if (!user) redirect('/login')

  const { data: owner } = await db()
    .from('attempts').select('user_id, state').eq('id', attemptId).maybeSingle()
  if (!owner) redirect('/dashboard')
  if (owner.user_id !== user.id) redirect('/dashboard')
  if (owner.state !== 'IN_PROGRESS') redirect(`/test/${attemptId}/done`)

  const snapshot = await loadAttempt(attemptId)
  if (!snapshot) redirect('/dashboard')
  // Every section closed while they were away.
  if (snapshot.status.finished || !snapshot.section) redirect(`/test/${attemptId}/done`)

  return (
    <DeviceGate>
      <TestEngine snapshot={snapshot} />
    </DeviceGate>
  )
}
