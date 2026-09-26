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
      <button type="button" onClick={() => setAsking(true)} className="text-xs font-bold text-bad-ink underline">
        {label}
      </button>
    )
  }
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <span className="text-xs font-semibold">{confirm}</span>
      <button type="button" onClick={() => setAsking(false)} className="btn btn-quiet px-2 py-1 text-xs">
        Keep
      </button>
      <button type="submit" className="rounded-lg bg-notanswered px-2 py-1 text-xs font-black text-white">{label}</button>
    </form>
  )
}
