'use client'

import { useState } from 'react'

/**
 * A destructive action in two steps, the second saying what will happen, so it
 * is never one stray click away.
 */
export function ConfirmButton({
  action, fields, label, confirm,
}: {
  action: (formData: FormData) => Promise<void>
  fields: Record<string, string>
  label: string
  confirm: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)}
              className="btn btn-quiet px-3 py-1.5 text-xs">
        {label}
      </button>
    )
  }
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className="text-xs font-semibold">{confirm}</span>
      <button type="button" onClick={() => setAsking(false)} className="btn btn-quiet px-3 py-1.5 text-xs">
        Keep
      </button>
      <button type="submit" className="btn btn-danger px-3 py-1.5 text-xs">{label}</button>
    </form>
  )
}
