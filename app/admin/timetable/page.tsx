import { requireAdmin } from '../../../lib/guard'
import { istDate } from '../../../lib/time'
import { SCHEDULE_TITLE } from '../../../lib/schedule'
import { PageHeader } from '../../../components/Page'
import { ScheduleIntro, ScheduleTable } from '../../../components/ScheduleTable'

export const dynamic = 'force-dynamic'

/**
 * The same timetable the students read, in the console.
 *
 * Deliberately the same component and the same data: an admin setting
 * tomorrow's paper needs the row the cohort is looking at, not a second
 * version of it that might disagree. Nothing here is editable -- the plan
 * lives in `lib/schedule.ts` and changes in a commit.
 */
export default async function AdminTimetablePage() {
  // The layout checks too, but a layout does not re-run on every navigation,
  // so the page is where the guarantee actually lives.
  await requireAdmin()
  const today = istDate()

  return (
    <>
      <PageHeader compact title="Timetable"
                  meta={SCHEDULE_TITLE}
                  lede="The topic plan the series follows. Set each day's paper from the row that carries its date; the students see this same table." />
      <ScheduleIntro today={today} />
      <ScheduleTable today={today} />
    </>
  )
}
