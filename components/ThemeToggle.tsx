'use client'

import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

const KEY = 'preppy-theme'
const ORDER: Theme[] = ['system', 'light', 'dark']

/**
 * Cycles system, light, dark.
 *
 * "system" writes no `data-theme` attribute, which is what leaves
 * prefers-color-scheme in charge -- the stylesheet is built around the
 * un-stamped state being the OS default, so removing the attribute is the whole
 * implementation of "follow my computer".
 *
 * The saved choice is applied by an inline script in the root layout, before the
 * first paint. This component only renders the control and writes the choice; if
 * its JavaScript never arrives the page still has the right theme, it just has no
 * switch. Which is why the button renders nothing until it is mounted: server and
 * client cannot agree on the current theme before then, and a wrong icon for one
 * frame is worse than a gap.
 */
export function ThemeToggle({ tone = 'default' }: { tone?: 'default' | 'invert' }) {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    let saved: Theme = 'system'
    try {
      const raw = localStorage.getItem(KEY)
      if (raw === 'light' || raw === 'dark') saved = raw
    } catch { /* private window, or site data blocked */ }
    setTheme(saved)
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch { /* the theme still applies for this visit */ }
  }

  // Before mount there is no way to know which of the three is current.
  if (theme === null) {
    return <span className="block h-9 w-9" aria-hidden="true" />
  }

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!
  const label = { system: 'Match my computer', light: 'Light', dark: 'Dark' }[theme]

  return (
    <button
      type="button"
      onClick={() => choose(next)}
      title={`Theme: ${label}. Switch to ${{ system: 'match my computer', light: 'light', dark: 'dark' }[next]}`}
      aria-label={`Theme: ${label}. Switch to ${next === 'system' ? 'match my computer' : next}`}
      className={[
        'grid h-9 w-9 shrink-0 place-items-center rounded-full transition',
        tone === 'invert'
          ? 'text-white/70 hover:bg-white/10 hover:text-white'
          : 'text-ink-faint hover:bg-surface-sunken hover:text-ink',
      ].join(' ')}
    >
      {theme === 'system' ? <Auto /> : theme === 'light' ? <Sun /> : <Moon />}
    </button>
  )
}

function Sun() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[18px] w-[18px] fill-current">
      <circle cx="10" cy="10" r="4" />
      <path d="M10 1.5v2.2M10 16.3v2.2M1.5 10h2.2M16.3 10h2.2M4 4l1.6 1.6M14.4 14.4L16 16M16 4l-1.6 1.6M5.6 14.4L4 16"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function Moon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[18px] w-[18px] fill-current">
      <path d="M12.5 2a8 8 0 105.5 10.5A6.5 6.5 0 0112.5 2z" />
    </svg>
  )
}

/** Half sun, half moon: following whatever the machine says. */
function Auto() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[18px] w-[18px]">
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 4.5a5.5 5.5 0 000 11z" fill="currentColor" />
    </svg>
  )
}
