import type { Metadata } from 'next'
import { requireUser } from '../../lib/guard'
import { viewerTrack } from '../../lib/repo/tracks'
import { istDate } from '../../lib/time'
import { SCHEDULE_TITLE } from '../../lib/schedule'
import { AppShell } from '../../components/AppShell'
import { PageHeader } from '../../components/Page'
import { ScheduleIntro, ScheduleTable } from '../../components/ScheduleTable'

export const metadata: Metadata = { title: 'Timetable' }
// The plan itself is static; today is not, and today is what the page marks.
export const dynamic = 'force-dynamic'

/**
 * The timetable, for a student.
 *
 * Read-only and the same for everyone: this is the plan the papers are cut
 * from, not a record of what anybody has done. What each student gets from it
 * is where they are in it, which is the row marked Today.
 */
export default async function TimetablePage() {
  const user = await requireUser()
  const track = await viewerTrack(user)
  const today = istDate()

  return (
    <AppShell user={user} current="timetable" examName={track?.name}>
      <main className="shell pt-6">
        <PageHeader
          title="Timetable"
          lede="What every day of the series covers, from the first paper to the exam. Papers are set from this, so the topic beside a date is what that day's paper asks about."
          meta={SCHEDULE_TITLE}
        />
        <ScheduleIntro today={today} />
        <ScheduleTable today={today} />
      </main>
    </AppShell>
  )
}
