import type { PaperDirections } from '../lib/types'
import { PaperImages } from './PaperImages'

/**
 * Shared material for a run of questions: a passage, a table, a puzzle.
 *
 * It used to be a box of its own, capped at 16rem and scrolling inside itself
 * so it could never push the options off the screen. That solved the wrong
 * problem: a reading passage arrived in a letterbox a few lines tall while
 * the screen around it sat empty, and the reader had two scrollbars to
 * reconcile -- one for the passage, one for the page. It is now plain content
 * in the question pane, which is the thing that scrolls (FR-6.4.10), so the
 * passage gets the whole width and height the screen has to give.
 *
 * The label stays stuck to the top of that scroll while the passage moves
 * under it, so "which questions is this for" never scrolls away.
 */
export function DirectionsBlock({ block, testId }: { block: PaperDirections; testId?: string }) {
  return (
    <aside
      className="mb-5 border-b border-line pb-5"
      aria-label={`Directions for questions ${block.from} to ${block.to}`}
    >
      <p className="sticky -top-6 z-10 -mx-1 mb-2.5 bg-surface/95 px-1 py-1 text-[10px] font-bold
                    uppercase tracking-widest text-ink-soft backdrop-blur sm:-top-8 lg:-top-9">
        Directions &middot; Q{block.from}&ndash;Q{block.to}
      </p>

      {block.text.split('\n').filter((l) => l.trim() !== '').map((line, i) => (
        // Wider than a question's own 68ch: a passage is the thing the pane
        // exists for, and at the question measure it left a third of the
        // screen empty beside it.
        <p key={i} className="measure-wide mb-2.5 text-[0.9375rem] leading-relaxed last:mb-0 sm:text-base sm:leading-[1.7]">
          {line}
        </p>
      ))}

      {testId && <PaperImages testId={testId} names={block.images} />}

      {block.table && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead>
              <tr>
                {block.table.headers.map((h) => (
                  <th key={h} className="border-b-2 border-line-strong px-3 py-1.5 text-left font-bold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-line px-3 py-1.5 whitespace-nowrap">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  )
}
