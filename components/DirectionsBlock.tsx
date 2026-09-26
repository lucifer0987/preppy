import type { PaperDirections } from '../lib/types'
import { PaperImages } from './PaperImages'

/**
 * Shared material for a run of questions: a passage, a table, a puzzle.
 *
 * Pinned above the question and scrollable on its own, so a long reading
 * passage never pushes the options off the screen (FR-6.4.10).
 */
export function DirectionsBlock({ block, testId }: { block: PaperDirections; testId?: string }) {
  return (
    <aside
      className="mb-4 max-h-64 overflow-y-auto rounded-control border-2 border-line bg-surface p-4"
      aria-label={`Directions for questions ${block.from} to ${block.to}`}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
        Directions &middot; Q{block.from}&ndash;Q{block.to}
      </p>

      {block.text.split('\n').filter((l) => l.trim() !== '').map((line, i) => (
        <p key={i} className="mb-2 text-sm leading-relaxed last:mb-0">{line}</p>
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
