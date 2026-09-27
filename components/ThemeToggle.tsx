'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const KEY = 'preppy-theme'

/**
 * Light or dark. Two states, no third.
 *
 * There used to be a "match my computer" position, which meant the control had
 * three states and the stylesheet had to handle an un-stamped document. Both
 * are gone: an inline script in the root layout always stamps data-theme
 * before the first paint, so the CSS has exactly two cases and this button has
 * exactly two positions.
 *
 * The operating system still picks the first impression -- the script reads it
 * when nothing is stored -- but it stops mattering the moment anyone touches
 * this, which is the behaviour people actually expect from a theme switch.
 *
 * Renders a placeholder until mounted: the server cannot know what is in this
 * browser's storage, and one frame of the wrong icon is worse than one frame
 * of nothing.
 */
export function ThemeToggle({ tone = 'default' }: { tone?: 'default' | 'invert' }) {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    // The script has already stamped the element, so that is the truth --
    // reading it back avoids disagreeing with what is actually on screen.
    const stamped = document.documentElement.getAttribute('data-theme')
    setTheme(stamped === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem(KEY, next) } catch { /* still applies for this visit */ }
  }

  if (theme === null) {
    return <span className="block h-9 w-9 shrink-0" aria-hidden="true" />
  }

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className={[
        'grid h-9 w-9 shrink-0 place-items-center rounded-pill transition',
        tone === 'invert'
          ? 'text-white/70 hover:bg-white/15 hover:text-white'
          : 'text-ink-faint hover:bg-surface-sunken hover:text-ink',
      ].join(' ')}
    >
      {theme === 'dark' ? <Moon /> : <Sun />}
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
