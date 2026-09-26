'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuestionCard } from './QuestionCard'
import { DirectionsBlock } from './DirectionsBlock'
import { QuestionPalette, paletteState, type PaletteState } from './QuestionPalette'
import { SectionTimer } from './SectionTimer'
import { SECTION_NAMES, type OptionLabel } from '../lib/types'
import type { AttemptSnapshot } from '../lib/repo/attempts'
import {
  bumpCounterAction, endTestAction, nextSectionAction, saveResponsesAction, syncClockAction,
  type ClockReading,
} from '../app/test/actions'

interface LocalResponse { selected: OptionLabel | null; marked: boolean; visited: boolean }

/** What survives a refresh or a crash on this device (FR-6.4.8). */
interface Mirror {
  position: number
  index: number
  /** Questions changed here and not yet confirmed saved, with their state. */
  unsaved: Record<string, { selected: OptionLabel | null; marked: boolean }>
}

const DEBOUNCE_MS = 300
const RETRY_MS = 5000

const mirrorKey = (attemptId: string) => `preppy:attempt:${attemptId}`

function readMirror(attemptId: string): Mirror | null {
  try {
    const raw = window.localStorage.getItem(mirrorKey(attemptId))
    return raw ? (JSON.parse(raw) as Mirror) : null
  } catch {
    return null
  }
}

function writeMirror(attemptId: string, m: Mirror | null) {
  try {
    if (m) window.localStorage.setItem(mirrorKey(attemptId), JSON.stringify(m))
    else window.localStorage.removeItem(mirrorKey(attemptId))
  } catch {
    // Private mode or a full quota. The server copy is the one that counts.
  }
}

/**
 * The live test screen for one section. The page keys it on the section, so
 * moving on mounts a fresh one.
 *
 * Persistence (FR-6.4.8, FR-6.4.9): every change marks the question dirty,
 * mirrors to localStorage at once, and is sent to the server after a 300 ms
 * pause, batched. A write that fails stays queued — in memory and in the
 * mirror — and is retried on the next change, on reconnect, and every few
 * seconds while offline. No server call is allowed to throw into the error
 * boundary: a network blip shows a banner, never a crash, and the timer keeps
 * running throughout.
 */
export function TestEngine({ snapshot }: { snapshot: AttemptSnapshot }) {
  const router = useRouter()
  const section = snapshot.section!
  const attemptId = snapshot.attemptId

  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, section.resumeIndex), section.questions.length - 1))
  // Only ever from the first snapshot: after that, local state is newer.
  const [initialResponses] = useState(() => {
    const initial: Record<string, LocalResponse> = {}
    for (const q of section.questions) initial[q.id] = { selected: null, marked: false, visited: false }
    for (const r of section.responses) {
      initial[r.questionId] = { selected: r.selectedOption, marked: r.isMarked, visited: true }
    }
    return initial
  })
  const [responses, setResponses] = useState(initialResponses)
  // Seconds on each question, for the result page's slowest questions (PRD
  // 6.6). Seeded from the server so a resume adds to the total, never resets it.
  const [spent] = useState(() => new Map(section.responses.map((r) => [r.questionId, r.timeSpentSec])))
  const viewing = useRef<{ id: string; since: number } | null>(null)
  // The source of truth for what gets sent, so a flush never reads stale state.
  const responsesRef = useRef(initialResponses)

  const [clock, setClock] = useState({ deadlineMs: snapshot.status.deadlineMs, serverNowMs: snapshot.serverNowMs })
  // Unknown until mounted; a reload always lands outside full screen.
  const [fullscreen, setFullscreen] = useState<boolean | null>(null)
  const [exits, setExits] = useState(snapshot.fullscreenExits)
  const [switches, setSwitches] = useState(snapshot.tabSwitches)
  const [offline, setOffline] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  const question = section.questions[index]!
  const isLastSection = section.position === section.totalSections

  // ---------------------------------------------------------------- leaving
  const leavingRef = useRef(false)
  const leave = useCallback(() => {
    if (leavingRef.current) return
    // Set first, so the full-screen exit below is not counted as a violation.
    leavingRef.current = true
    writeMirror(attemptId, null)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    router.replace(`/test/${attemptId}/done`)
  }, [attemptId, router])

  /**
   * This device was signed out: the account began or resumed the test on
   * another device (FR-6.1.4), or the admin reset it. Unsaved answers stay in
   * this browser's mirror; the attempt itself carries on wherever it is open.
   */
  const signedOut = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    window.location.assign('/login?signedOut=1')
  }, [])

  /** Apply an authoritative reading from the server (FR-6.4.7). */
  const applyClock = useCallback((c: ClockReading) => {
    if (c.refused === 'signed-out') signedOut()
    else if (c.refused === 'error') setOffline(true)
    else if (c.finished) leave()
    else if (c.sectionPosition !== section.position) router.refresh()
    else setClock({ deadlineMs: c.deadlineMs, serverNowMs: c.serverNowMs })
  }, [leave, signedOut, router, section.position])

  // ---------------------------------------------------------------- persistence
  const indexRef = useRef(index)
  const dirty = useRef(new Map<string, number>()) // question id -> change version
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  const mirror = useCallback(() => {
    if (leavingRef.current) return
    const unsaved: Mirror['unsaved'] = {}
    for (const id of dirty.current.keys()) {
      const r = responsesRef.current[id]
      if (r) unsaved[id] = { selected: r.selected, marked: r.marked }
    }
    writeMirror(attemptId, { position: section.position, index: indexRef.current, unsaved })
  }, [attemptId, section.position])

  // Held in a ref so the flush can reschedule itself without a dependency cycle.
  const flushRef = useRef<() => Promise<void>>(async () => {})
  const schedule = useCallback((ms = DEBOUNCE_MS) => {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => { void flushRef.current() }, ms)
  }, [])

  /** Credit the question on screen with the time since it was last credited. */
  const accrue = useCallback(() => {
    const v = viewing.current
    if (!v) return
    const now = Date.now()
    spent.set(v.id, (spent.get(v.id) ?? 0) + (now - v.since) / 1000)
    v.since = now
    dirty.current.set(v.id, (dirty.current.get(v.id) ?? 0) + 1)
  }, [spent])

  const flush = useCallback((): Promise<void> => {
    if (inflight.current) { again.current = true; return inflight.current }
    accrue()
    if (dirty.current.size === 0 || leavingRef.current) return Promise.resolve()
    if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null }

    // The question on screen goes last, so the server stamps it newest and a
    // resume lands on it.
    const sent = [...dirty.current.entries()]
      .sort(([a], [b]) => Number(a === section.questions[indexRef.current]?.id) - Number(b === section.questions[indexRef.current]?.id))
    const items = sent.map(([id]) => {
      const r = responsesRef.current[id]!
      return { questionId: id, selectedOption: r.selected, isMarked: r.marked, timeSpentSec: spent.get(id) ?? 0 }
    })

    const run = async () => {
      try {
        const res = await saveResponsesAction(attemptId, items)
        if (res.reason === 'finished') { leave(); return }
        if (res.reason === 'signed-out') { signedOut(); return }
        if (res.reason === 'error') { setOffline(true); schedule(RETRY_MS); return }
        // Written, or refused because the section is no longer open; either
        // way these versions are done with. A newer change stays queued.
        for (const [id, v] of sent) if (dirty.current.get(id) === v) dirty.current.delete(id)
        setOffline(false)
        if (res.reason === 'section-closed') router.refresh()
        // A save taken in the grace after the final section's deadline reports
        // the attempt finished. Anything chosen while it was in flight must go
        // too before leaving; the server takes it while the grace lasts, and
        // after that says the section is closed.
        else if (res.clock.finished && dirty.current.size > 0) schedule(0)
        else applyClock(res.clock)
      } catch {
        // The request never reached the server. Keep everything queued.
        setOffline(true)
        schedule(RETRY_MS)
      } finally {
        mirror()
      }
    }

    inflight.current = run().finally(() => {
      inflight.current = null
      if (again.current) { again.current = false; if (dirty.current.size) schedule(0) }
    })
    return inflight.current
  }, [attemptId, section.questions, leave, signedOut, router, applyClock, schedule, mirror, accrue, spent])
  useEffect(() => { flushRef.current = flush }, [flush])

  /** Change one question's local state and queue it for the server. */
  const update = useCallback((id: string, patch: Partial<LocalResponse>) => {
    const next = { ...responsesRef.current, [id]: { ...responsesRef.current[id]!, ...patch } }
    responsesRef.current = next
    setResponses(next)
    dirty.current.set(id, (dirty.current.get(id) ?? 0) + 1)
    mirror()
    schedule()
  }, [mirror, schedule])

  // Restore anything this device had not yet saved, and the question it was
  // on, then retry on reconnect. Runs after mount, never during render, so the
  // server HTML and the first client render agree.
  useEffect(() => {
    const m = readMirror(attemptId)
    if (m && m.position === section.position) {
      const next = { ...responsesRef.current }
      for (const [id, r] of Object.entries(m.unsaved ?? {})) {
        if (!next[id]) continue // not in this section
        next[id] = { selected: r.selected, marked: r.marked, visited: true }
        dirty.current.set(id, 1)
      }
      responsesRef.current = next
      setResponses(next)
      if (Number.isInteger(m.index) && m.index >= 0 && m.index < section.questions.length) setIndex(m.index)
      if (dirty.current.size) schedule(0)
    }

    const onOnline = () => { void flushRef.current() }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [attemptId, section.position, section.questions.length, schedule])

  // A row on open, not only on answer: that is what separates not-reached from
  // skipped when the section ends (FR-9.1).
  useEffect(() => {
    indexRef.current = index
    const q = section.questions[index]
    accrue() // the question just left
    viewing.current = q ? { id: q.id, since: Date.now() } : null
    if (q) update(q.id, { visited: true })
  }, [index, section.questions, update, accrue])

  // ---------------------------------------------------------------- full screen
  useEffect(() => {
    // Begin entered full screen (FR-6.5.1); a reload or a direct visit did not.
    setFullscreen(Boolean(document.fullscreenElement))
    const onChange = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreen(active)
      if (!active && !leavingRef.current) {
        setExits((n) => n + 1)
        void bumpCounterAction(attemptId, 'fullscreen_exits').catch(() => {})
      }
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && !leavingRef.current) {
        setSwitches((n) => n + 1)
        void bumpCounterAction(attemptId, 'tab_switches').catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [attemptId])

  // Friction only, never security (FR-6.5.7).
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(e.key.toLowerCase())) e.preventDefault()
      if (e.key === 'F12') e.preventDefault()
    }
    for (const ev of ['copy', 'cut', 'paste', 'contextmenu'] as const) document.addEventListener(ev, block)
    document.addEventListener('keydown', keys)
    return () => {
      for (const ev of ['copy', 'cut', 'paste', 'contextmenu'] as const) document.removeEventListener(ev, block)
      document.removeEventListener('keydown', keys)
    }
  }, [])

  // ---------------------------------------------------------------- answering
  const current = responses[question.id] ?? { selected: null, marked: false, visited: true }
  const choose = (label: OptionLabel) => update(question.id, { selected: label, visited: true })
  const clearResponse = () => update(question.id, { selected: null })
  const toggleMark = () => update(question.id, { marked: !current.marked })
  const go = (delta: number) =>
    setIndex((i) => Math.min(section.questions.length - 1, Math.max(0, i + delta)))
  // FR-6.4.5. Marks rather than toggles: the button says what it does.
  const markAndNext = () => { update(question.id, { marked: true }); go(1) }

  // ---------------------------------------------------------------- keyboard
  const rootRef = useRef<HTMLDivElement>(null)
  const blocked = fullscreen === false || confirming || advancing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Nothing may answer a question an overlay is hiding: the full-screen
      // gate, the confirmation, or the small-screen block (which makes the
      // engine inert).
      if (blocked || rootRef.current?.closest('[inert]')) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // A focused button already handles Enter and Space itself; handling them
      // here too would select an option and advance in the same keystroke.
      if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return
      const labels = Object.keys(question.options) as OptionLabel[]
      if (/^[1-5]$/.test(e.key)) {
        const label = labels[Number(e.key) - 1]
        if (label) choose(label)
      } else if (e.key === 'Enter') { go(1) }
      else if (e.key.toLowerCase() === 'm') { toggleMark() }
      else if (e.key === 'ArrowRight') { go(1) }
      else if (e.key === 'ArrowLeft') { go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Re-registered each render on purpose: the handler closes over the
    // current question and response state, and there is exactly one listener
    // at a time because the cleanup runs first.
  })

  // ---------------------------------------------------------------- clock
  // Asked when the countdown reaches zero and when the tab comes back. A
  // failed ask is retried, since expiry only fires once per reading.
  const resync = useCallback(async () => {
    try {
      const reading = await syncClockAction(attemptId)
      // A server hiccup is retried like a lost request: expiry fires once per
      // reading, so nothing else would ask again.
      if (reading.refused === 'error') throw new Error('retry')
      setOffline(false)
      applyClock(reading)
    } catch {
      setOffline(true)
      setTimeout(() => { void resyncRef.current() }, RETRY_MS)
    }
  }, [attemptId, applyClock])
  const resyncRef = useRef(resync)
  useEffect(() => { resyncRef.current = resync }, [resync])
  const onResync = useCallback(() => { void resync() }, [resync])
  // At zero, send what is queued before asking what is true: an answer chosen
  // in the last second is still on its way, and the server takes it for a few
  // seconds after the deadline (EXPIRY_GRACE_MS). Asking first would close the
  // section and drop it.
  const onExpire = useCallback(() => {
    void (async () => {
      // Twice: if a save was already in flight, the first call only waits for
      // it, and what was queued behind it goes on the second.
      await flush().catch(() => undefined)
      await flush().catch(() => undefined)
      await resync()
    })()
  }, [flush, resync])

  const advance = () => {
    setConfirming(false)
    if (advancing) return
    setAdvancing(true)
    void (async () => {
      // Whatever is queued goes first; a section that has closed refuses it.
      await flush()
      try {
        if (isLastSection) {
          const res = await endTestAction(attemptId)
          if (res.refused === 'signed-out') return signedOut()
          if (res.refused === 'error') throw new Error('retry')
          leave()
        } else {
          const res = await nextSectionAction(attemptId, section.position)
          if (res.refused === 'signed-out') return signedOut()
          if (res.refused === 'error') throw new Error('retry')
          if (res.finished) leave()
          // The refresh mounts a fresh engine for the next section; this one
          // stays disabled until then.
          else router.refresh()
        }
      } catch {
        setOffline(true)
        setAdvancing(false)
      }
    })()
  }

  // ---------------------------------------------------------------- palette
  const states = useMemo(
    () => section.questions.map((q) => {
      const r = responses[q.id] ?? { selected: null, marked: false, visited: false }
      return { number: q.number, state: paletteState(r.visited, r.selected, r.marked) as PaletteState }
    }),
    [section.questions, responses],
  )
  const tally = useMemo(() => {
    let answered = 0, marked = 0, skipped = 0, notReached = 0
    for (const s of states) {
      if (s.state === 'answered' || s.state === 'answered-marked') answered++
      else if (s.state === 'marked') { marked++; skipped++ }
      else if (s.state === 'not-answered') skipped++
      else notReached++
    }
    return { answered, marked, skipped, notReached }
  }, [states])

  const atEnd = index === section.questions.length - 1

  return (
    <div ref={rootRef} className="exam-screen min-h-dvh bg-page">
      {/* FR-6.5.7: printing the paper is suppressed; see globals.css. */}
      <p className="exam-print-note">Printing is not available during a test.</p>
      {fullscreen === false && (
        <FullscreenGate
          exits={exits}
          onReturn={() => { void document.documentElement.requestFullscreen().catch(() => {}) }}
        />
      )}

      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-play-purple px-4 py-3 text-white">
        <span className="font-black">{SECTION_NAMES[section.code]}</span>
        <span className="text-sm text-white/70 tabular-nums">
          Question {index + 1} of {section.questions.length}
        </span>
        <span className="text-xs text-white/50 tabular-nums">
          Section {section.position} of {section.totalSections}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {snapshot.isDryRun && (
            <span className="rounded-full bg-surface/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest">
              Dry run
            </span>
          )}
          <span
            title="Times you left full screen or switched away"
            className="rounded-full bg-surface/20 px-2.5 py-1 font-mono text-xs"
          >
            &#9888; {exits + switches}
          </span>
          <SectionTimer
            deadlineMs={clock.deadlineMs}
            serverNowMs={clock.serverNowMs}
            onExpire={onExpire}
            onResync={onResync}
          />
        </span>
      </header>

      {offline && (
        <p className="bg-play-yellow px-4 py-2 text-center text-sm font-semibold text-ink">
          You are offline or the server did not answer. Your answers are kept on this device and will
          be sent when the connection returns. Your timer is still running.
        </p>
      )}

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className="min-w-0 select-none rounded-card bg-surface p-6">
          {/* Shown on every question in the group, not just the first (FR-6.4.10). */}
          {question.directions && (
            <DirectionsBlock
              block={{
                from: question.directions.from,
                to: question.directions.to,
                text: question.directions.text,
                ...(question.directions.table ? { table: question.directions.table as never } : {}),
                images: question.directions.imagePaths,
              }}
              testId={snapshot.testId}
            />
          )}

          <QuestionCard
            // No answer key: it is never sent to the browser during a live
            // attempt (FR-13.1), and the type reflects that.
            question={{ number: question.number, text: question.text, options: question.options, images: question.imagePaths }}
            testId={snapshot.testId}
            selected={current.selected}
            reveal={false}
            disabled={advancing}
            onSelect={choose}
          />

          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
            <Btn onClick={() => go(-1)} disabled={index === 0}>Previous</Btn>
            <Btn onClick={clearResponse} disabled={!current.selected}>Clear response</Btn>
            <Btn onClick={toggleMark} tone="mark">
              {current.marked ? 'Unmark' : 'Mark for review'}
            </Btn>
            <Btn onClick={markAndNext} tone="mark" disabled={current.marked && atEnd}>
              Mark for review &amp; next
            </Btn>
            <Btn onClick={() => go(1)} tone="primary" disabled={atEnd}>
              Save &amp; next
            </Btn>
            <Btn onClick={() => setConfirming(true)} tone="next" className="ml-auto" disabled={advancing}>
              {advancing ? 'Saving…' : <>{isLastSection ? 'End test' : 'Next section'} &rarr;</>}
            </Btn>
          </div>

          <p className="mt-4 text-xs text-ink-soft">
            Keys: <kbd>1</kbd>&ndash;<kbd>5</kbd> choose &middot; <kbd>Enter</kbd> next &middot;{' '}
            <kbd>M</kbd> mark &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> move
          </p>
        </main>

        <aside className="rounded-card bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          <QuestionPalette
            states={states}
            current={question.number}
            onJump={(n) => {
              const i = section.questions.findIndex((q) => q.number === n)
              if (i >= 0) setIndex(i)
            }}
          />
        </aside>
      </div>

      {confirming && (
        <ConfirmDialog
          isLast={isLastSection}
          sectionName={SECTION_NAMES[section.code]}
          tally={tally}
          onCancel={() => setConfirming(false)}
          onConfirm={advance}
        />
      )}
    </div>
  )
}


/**
 * FR-6.5.3. Every browser guarantees Esc leaves full screen and no page can
 * override that, so this is deterrence and audit, not prevention. The question
 * is unreadable until full screen resumes, and the section timer keeps running
 * throughout — otherwise leaving full screen would be a pause button.
 */
function FullscreenGate({ exits, onReturn }: { exits: number; onReturn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-play-purple-deep px-6 text-center text-white">
      <p className="text-3xl font-black">Return to full screen to continue</p>
      <p className="max-w-md text-white/70">
        Your section timer is still running. Leaving full screen is recorded and shown on your
        result; it never ends your test.
      </p>
      <p className="font-mono text-sm text-white/50">Times left so far: {exits}</p>
      <button
        onClick={onReturn}
        autoFocus
        className="btn btn-invert px-8 py-4 text-lg"
      >
        Go back to full screen
      </button>
    </div>
  )
}

function ConfirmDialog({
  isLast, sectionName, tally, onCancel, onConfirm,
}: {
  isLast: boolean
  sectionName: string
  tally: { answered: number; marked: number; skipped: number; notReached: number }
  onCancel: () => void
  onConfirm: () => void
}) {
  // Keyboard users land on the safe choice, and Escape backs out, as in any
  // dialog. Tab is kept inside it while it is open.
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Tab' && panel.current) {
        const buttons = [...panel.current.querySelectorAll('button')]
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
         className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
      <div ref={panel} className="w-full max-w-md rounded-card bg-surface p-6">
        <h2 id="confirm-title" className="text-2xl font-black">
          {isLast ? 'End the test?' : `Leave ${sectionName}?`}
        </h2>
        <p className="mt-2 text-ink-soft">
          {isLast
            ? 'This submits your paper. It cannot be undone.'
            : 'You cannot come back to this section.'}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Row label="Answered" value={tally.answered} />
          <Row label="Marked for review" value={tally.marked} />
          <Row label="Seen but skipped" value={tally.skipped} />
          <Row label="Not reached" value={tally.notReached} />
        </dl>
        <div className="mt-6 flex gap-2">
          <button onClick={onCancel} autoFocus className="flex-1 btn btn-quiet px-5 py-3">
            Go back
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-control bg-play-purple px-5 py-3 font-black text-white">
            {isLast ? 'End test' : 'Next section'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-bold tabular-nums">{value}</dd>
    </>
  )
}

function Btn({
  children, onClick, disabled, tone, className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'primary' | 'mark' | 'next'
  className?: string
}) {
  // mark and go are tokens rather than the fixed palette fills: these are text
  // and border colours, and the fills are too dark to read on a dark page.
  const style =
    tone === 'primary' ? 'bg-play-purple text-white hover:bg-play-purple-deep border-play-purple'
    : tone === 'mark' ? 'border-mark text-mark hover:bg-mark/10'
    : tone === 'next' ? 'border-go text-go hover:bg-go/10'
    : 'border-line-strong text-ink-soft hover:border-accent'
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`rounded-control border-2 px-5 py-2.5 text-sm font-bold transition disabled:opacity-40 ${style} ${className}`}
    >
      {children}
    </button>
  )
}
