'use client'

import { useState } from 'react'
import { DateField } from './DateField'
import { TimeField } from './TimeField'
import { addDays, daysBetween, entryCloseOffset } from '../lib/time'

/**
 * The four controls that say when a paper runs, kept consistent with each other.
 *
 * "Last entry on" is bounded below by the opening day and not at all above: a
 * window runs for as long as its admin says, and the offset between the two
 * dates is what gets stored (minutes from the paper's own midnight).
 *
 * They used to be four independent fields, and the two dates disagreed the
 * moment you touched the first one. "Last entry on" may only be the opening
 * day or the one after it, so its calendar is bounded -- but those bounds were
 * worked out on the server from the day the form happened to open with, and
 * nothing moved them afterwards. Change "Opens on" to yesterday's default and
 * the close calendar still refused every day before the old one: the day you
 * had just chosen to open on was greyed out, which is as close to nonsense as
 * a form gets.
 *
 * So the pair lives here. The close bounds follow whatever "Opens on" now
 * holds, and the close date moves with it rather than being left behind:
 * a window set to close the next morning still closes the next morning after
 * the paper is moved a day later. That offset -- 0 or 1 -- is the thing being
 * preserved, because it is what the admin actually chose. Remounting the close
 * field on a new opening day is what resets it to the carried-over value.
 *
 * The server recomputes entry close from the submitted dates either way
 * (`daysBetween(date, entryClosesOn)`), so this is about the form telling the
 * truth while it is being filled in, not about what gets stored.
 */
export function ScheduleDates({
  defaultDate, minDate, defaultOpensAt, defaultEntryClosesOn, defaultEntryClosesAt,
}: {
  defaultDate: string
  /** No scheduling a paper into the past. */
  minDate: string
  defaultOpensAt: string
  defaultEntryClosesOn: string
  defaultEntryClosesAt: string
}) {
  const [opensOn, setOpensOn] = useState(defaultDate)
  // 0 for "closes the same night", 1 for "closes the next morning". Clamped,
  // because a stored window from before the close date existed could be wider.
  const [offset, setOffset] = useState(entryCloseOffset(defaultDate, defaultEntryClosesOn))

  const closesOn = addDays(opensOn, offset)

  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <DateField name="date" label="Opens on" defaultValue={defaultDate}
                   min={minDate} onChange={setOpensOn} />
        <TimeField name="opensAt" label="Unlocks at" defaultValue={defaultOpensAt} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <DateField
          // Remounts when the opening day moves, so the field picks up the
          // carried-over date rather than holding the one it was born with.
          key={opensOn}
          name="entryClosesOn"
          label="Last entry on"
          defaultValue={closesOn}
          // A floor and no ceiling. It used to stop at the day after the
          // opening one, because the column did; an admin wanting a paper open
          // all week met a calendar with two days on it and no explanation.
          // How long a paper takes entry for is that paper's business now.
          min={opensOn}
          onChange={(v) => setOffset(daysBetween(opensOn, v))}
        />
        <TimeField name="entryClosesAt" label="Last moment to start"
                   defaultValue={defaultEntryClosesAt} />
      </div>
    </>
  )
}
