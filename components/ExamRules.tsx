/**
 * The rules of a paper, in one place.
 *
 * They were written out on the briefing page and nowhere else, so once a
 * student pressed Begin the only way back to them was to abandon the attempt.
 * The exam room now opens the same list in a dialog, which is why this is a
 * component rather than markup on a page.
 */
export function ExamRules({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-2 text-sm' : 'space-y-2.5 text-sm'}>
      <li>
        <strong>Sections run in order and only forward.</strong> Once you leave a section you
        cannot return to it.
      </li>
      <li>
        <strong>Each section has its own timer.</strong> Finishing early does not add time to
        the next one.
      </li>
      <li>
        <strong>Marking is not answering.</strong> <em>Mark for review &amp; next</em> flags the
        question and moves you on, so you can come back to it from the palette. A flagged
        question still scores as blank unless an option is also chosen.
      </li>
      <li>
        <strong>Full screen is required.</strong> Esc always works &mdash; no page can take that
        away &mdash; but the question is covered until you come back, the exit is counted on your
        result, and <strong>the clock keeps running</strong>. It never ends your test.
      </li>
      <li>
        <strong>Two numbers are recorded:</strong> how many times you left full screen, and how
        many times you switched away. Your admin sees them too. Nothing else is logged.
      </li>
      <li>
        <strong>One device at a time.</strong> Beginning signs your account out everywhere else.
      </li>
    </ul>
  )
}
