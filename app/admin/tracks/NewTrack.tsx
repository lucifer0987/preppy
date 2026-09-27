'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createTrackAction } from './actions'
import { emptyTrackForm } from './state'
import { Flash } from '../../../components/Page'

/**
 * Adding an exam.
 *
 * The address is derived from the name as you type and shown rather than
 * asked for, because it is a consequence of the name and not a second
 * decision. It stays editable, since a name like "IBPS SO (IT)" makes a
 * clumsy one and nobody wants to rename the exam to fix its URL.
 */
export function NewTrack() {
  const [state, action] = useActionState(createTrackAction, emptyTrackForm)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)

  const derived = name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const shown = touched ? slug : derived

  return (
    <form action={action} className="card mt-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="eyebrow">Name</span>
          <input
            name="name" required maxLength={60} value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="IBPS SO (Agriculture)"
            className="field mt-1.5 w-full max-w-xs"
          />
        </label>
        <label className="block">
          <span className="eyebrow">Address</span>
          <input
            name="slug" maxLength={40} value={shown}
            onChange={(e) => { setTouched(true); setSlug(e.target.value) }}
            placeholder="ibps-so-agriculture"
            className="field numeral mt-1.5 w-full max-w-xs text-sm"
          />
        </label>
        <Create />
      </div>

      <p className="measure-wide mt-3 text-sm text-ink-soft">
        A new exam starts on the pattern this product shipped with: four sections, 55 questions,
        45 minutes. Change it on{' '}
        <Link href="/admin/pattern" className="font-bold text-accent underline">Paper pattern</Link>{' '}
        before uploading anything, since a paper is checked against the pattern of the exam it is
        for.
      </p>

      {state.error && <Flash tone="bad" className="mt-4">{state.error}</Flash>}
      {state.created && !state.error && (
        <Flash tone="good" className="mt-4">
          {state.created} is ready. Give it a pattern, then a paper.
        </Flash>
      )}
    </form>
  )
}

function Create() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn btn-primary px-6">
      {pending ? 'Adding...' : 'Add this exam'}
    </button>
  )
}
