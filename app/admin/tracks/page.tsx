import Link from 'next/link'
import { requireAdmin } from '../../../lib/guard'
import {
  listTracks, trackPaperCounts, trackStudentCounts, getPattern,
} from '../../../lib/repo/tracks'
import { patternTotals, sectionName } from '../../../lib/types'
import { Empty, PageHeader, StatusChip, TableShell, Th } from '../../../components/Page'
import { ConfirmButton } from '../attempts/ConfirmButton'
import { NewTrack } from './NewTrack'
import { setTrackActiveAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The exams this install prepares people for (PRD 6.10).
 *
 * One exam was an assumption for most of this product's life: four fixed
 * sections, one pattern, one board. A track is that assumption made explicit,
 * which is what lets there be a second one -- another discipline, or a
 * different exam entirely.
 *
 * Nothing here is required. An install with one exam never has to open this
 * screen, and nothing else in the console mentions a track until a second one
 * exists.
 */
export default async function TracksPage() {
  await requireAdmin()
  const [tracks, students, papers] = await Promise.all([
    listTracks(), trackStudentCounts(), trackPaperCounts(),
  ])
  const patterns = await Promise.all(tracks.map((t) => getPattern(t.id)))
  // Closing the last open exam is refused by setTrackActive, and a button
  // whose only outcome is an error is a button that should not be there.
  const openCount = tracks.filter((t) => t.isActive).length

  return (
    <>
      <PageHeader
        compact
        title="Exams"
        lede="What people here are preparing for. Each one has its own sections, its own papers and its own leaderboard; a student follows exactly one."
      />

      <NewTrack />

      <div className="mt-6">
        {tracks.length === 0 ? (
          <Empty>
            No exam yet, which means the migration has not been applied. Run{' '}
            <code>npm run migrate</code>.
          </Empty>
        ) : (
          <TableShell minWidth="52rem">
            <thead>
              <tr>
                <Th>Exam</Th>
                <Th>Shape</Th>
                <Th align="right">Students</Th>
                <Th align="right">Papers</Th>
                <Th>Status</Th>
                <Th align="right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t, i) => {
                const pattern = patterns[i]!
                const totals = patternTotals(pattern)
                return (
                  <tr key={t.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <span className="block font-bold">{t.name}</span>
                      <span className="numeral mt-0.5 block text-xs text-ink-faint">{t.slug}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-ink-soft">
                      <span className="numeral block font-semibold text-ink">
                        {totals.questions} questions &middot; {totals.minutes} minutes
                      </span>
                      <span className="mt-0.5 block text-xs">
                        {pattern.map((s) => sectionName(pattern, s.code)).join(' \u00b7 ')}
                      </span>
                    </td>
                    <td className="numeral px-3 py-3 text-right">{students.get(t.id) ?? 0}</td>
                    <td className="numeral px-3 py-3 text-right">{papers.get(t.id) ?? 0}</td>
                    <td className="px-3 py-3">
                      <StatusChip tone={t.isActive ? 'live' : 'draft'}>
                        {t.isActive ? 'Open' : 'Closed'}
                      </StatusChip>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link href={`/admin/pattern?track=${t.slug}`}
                              className="btn btn-quiet px-3 py-1.5 text-xs">
                          Pattern
                        </Link>
                        <Link href={`/admin/board?track=${t.slug}`}
                              className="btn btn-quiet px-3 py-1.5 text-xs">
                          Board
                        </Link>
                        {t.isActive ? (
                          openCount > 1 ? (
                            <ConfirmButton
                              action={setTrackActiveAction}
                              fields={{ id: t.id, active: '0' }}
                              label="Close"
                              confirm="No new papers, everything already on it stays?"
                            />
                          ) : (
                            <span className="text-xs text-ink-faint">
                              the only open exam
                            </span>
                          )
                        ) : (
                          <form action={setTrackActiveAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="active" value="1" />
                            <button className="btn btn-quiet px-3 py-1.5 text-xs">Reopen</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableShell>
        )}
      </div>

      <section className="mt-6 rounded-card border border-dashed border-line p-5">
        <h2 className="eyebrow">What closing an exam does</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          <li>Its papers, attempts and leaderboard stay exactly as they are.</li>
          <li>No new paper can be scheduled on it.</li>
          <li>A student still following it keeps their board and their archive, and sees no new paper.</li>
          <li>The last open exam cannot be closed, since that would leave nobody anything to sit.</li>
        </ul>
      </section>
    </>
  )
}
