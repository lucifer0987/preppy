'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QuestionCard } from './QuestionCard'
import { DirectionsBlock } from './DirectionsBlock'
import { QuestionPalette, paletteState, type PaletteState } from './QuestionPalette'
import { SectionTimer } from './SectionTimer'
import { SECTION_NAMES, type OptionLabel } from '../lib/types'
import type { AttemptSnapshot } from '../lib/repo/attempts'
import {
  bumpCounterAction, endTestAction, nextSectionAction, saveResponseAction,
  syncClockAction, visitQuestionAction,
} from '../app/test/actions'

interface LocalResponse { selected: OptionLabel | null; marked: boolean; visited: boolean }

export function TestEngine({ snapshot }: { snapshot: AttemptSnapshot }) {
  const router = useRouter()
  const section = snapshot.section!
  const [, startTransition] = useTransition()

  const [index, setIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, LocalResponse>>(() => {
    const initial: Record<string, LocalResponse> = {}
    for (const q of section.questions) initial[q.id] = { selected: null, marked: false, visited: false }
    for (const r of section.responses) {
      initial[r.questionId] = { selected: r.selectedOption, marked: r.isMarked, visited: true }
    }
    return initial
  })

  const [fullscreen, setFullscreen] = useState(true)
  const [exits, setExits] = useState(snapshot.fullscreenExits)
  const [switches, setSwitches] = useState(snapshot.tabSwitches)
  const [offline, setOffline] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const question = section.questions[index]!
  const isLastSection = section.position === section.totalSections

  // ---------------------------------------------------------------- persistence
  const persist = useCallback(
    (questionId: string, patch: { selectedOption?: OptionLabel | null; isMarked?: boolean }) => {
      startTransition(async () => {
        const res = await saveResponseAction(snapshot.attemptId, questionId, section.position, patch)
        if (!res.ok && res.reason === 'section-closed') router.refresh()
        setOffline(!res.ok && res.reason !== 'section-closed')
      })
    },
    [snapshot.attemptId, section.position, router],
  )

  // A row on open, not only on answer: that is what separates not-reached from
  // skipped when the section ends (FR-9.1).
  useEffect(() => {
    const q = section.questions[index]
    if (!q) return
    setResponses((r) => (r[q.id]?.visited ? r : { ...r, [q.id]: { ...r[q.id]!, visited: true } }))
    void visitQuestionAction(snapshot.attemptId, q.id, section.position)
  }, [index, section.questions, section.position, snapshot.attemptId])

  // ---------------------------------------------------------------- full screen
  useEffect(() => {
    const onChange = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreen(active)
      if (!active) {
        setExits((n) => n + 1)
        void bumpCounterAction(snapshot.attemptId, 'fullscreen_exits')
      }
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        setSwitches((n) => n + 1)
        void bumpCounterAction(snapshot.attemptId, 'tab_switches')
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [snapshot.attemptId])

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
  const choose = (label: OptionLabel) => {
    setResponses((r) => ({ ...r, [question.id]: { ...r[question.id]!, selected: label, visited: true } }))
    persist(question.id, { selectedOption: label })
  }
  const clearResponse = () => {
    setResponses((r) => ({ ...r, [question.id]: { ...r[question.id]!, selected: null } }))
    persist(question.id, { selectedOption: null })
  }
  const toggleMark = () => {
    const next = !responses[question.id]?.marked
    setResponses((r) => ({ ...r, [question.id]: { ...r[question.id]!, marked: next } }))
    persist(question.id, { isMarked: next })
  }
  const go = (delta: number) =>
    setIndex((i) => Math.min(section.questions.length - 1, Math.max(0, i + delta)))

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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
  })

  // ---------------------------------------------------------------- clock
  const onExpire = useCallback(() => {
    startTransition(async () => {
      const res = await syncClockAction(snapshot.attemptId)
      if (res.finished) router.replace(`/test/${snapshot.attemptId}/done`)
      else router.refresh()
    })
  }, [snapshot.attemptId, router])

  const onResync = useCallback(() => {
    startTransition(async () => {
      const res = await syncClockAction(snapshot.attemptId)
      if (res.finished) router.replace(`/test/${snapshot.attemptId}/done`)
      else if (res.sectionPosition !== section.position) router.refresh()
    })
  }, [snapshot.attemptId, section.position, router])

  const advance = () => {
    setConfirming(false)
    startTransition(async () => {
      if (isLastSection) {
        await endTestAction(snapshot.attemptId)
        router.replace(`/test/${snapshot.attemptId}/done`)
      } else {
        await nextSectionAction(snapshot.attemptId)
        setIndex(0)
        router.refresh()
      }
    })
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

  const current = responses[question.id] ?? { selected: null, marked: false, visited: true }

  return (
    <div className="min-h-dvh bg-paper">
      {!fullscreen && <FullscreenGate exits={exits} onReturn={() => document.documentElement.requestFullscreen()} />}

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
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest">
              Dry run
            </span>
          )}
          <span
            title="Times you left full screen or switched away"
            className="rounded-full bg-white/20 px-2.5 py-1 font-mono text-xs"
          >
            &#9888; {exits + switches}
          </span>
          <SectionTimer initialSec={snapshot.status.remainingSec} onExpire={onExpire} onResync={onResync} />
        </span>
      </header>

      {offline && (
        <p className="bg-play-yellow px-4 py-2 text-center text-sm font-semibold text-ink">
          Your last answer did not save. Your timer is still running; it will retry as you continue.
        </p>
      )}

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className="min-w-0 select-none rounded-3xl bg-white p-6">
          {/* Shown on every question in the group, not just the first (FR-6.4.10). */}
          {question.directions && (
            <DirectionsBlock
              block={{
                from: question.directions.from,
                to: question.directions.to,
                text: question.directions.text,
                ...(question.directions.table ? { table: question.directions.table as never } : {}),
              }}
            />
          )}

          <QuestionCard
            // No answer key: it is never sent to the browser during a live
            // attempt (FR-13.1), and the type reflects that.
            question={{ number: question.number, text: question.text, options: question.options }}
            selected={current.selected}
            reveal={false}
            disabled={false}
            onSelect={choose}
          />

          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/10 pt-4">
            <Btn onClick={() => go(-1)} disabled={index === 0}>Previous</Btn>
            <Btn onClick={clearResponse} disabled={!current.selected}>Clear response</Btn>
            <Btn onClick={toggleMark} tone="mark">
              {current.marked ? 'Unmark' : 'Mark for review'}
            </Btn>
            <Btn onClick={() => go(1)} tone="primary" disabled={index === section.questions.length - 1}>
              Save &amp; next
            </Btn>
            <Btn onClick={() => setConfirming(true)} tone="next" className="ml-auto">
              {isLastSection ? 'End test' : 'Next section'} &rarr;
            </Btn>
          </div>

          <p className="mt-4 text-xs text-ink-soft">
            Keys: <kbd>1</kbd>&ndash;<kbd>5</kbd> choose &middot; <kbd>Enter</kbd> next &middot;{' '}
            <kbd>M</kbd> mark &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> move
          </p>
        </main>

        <aside className="rounded-3xl bg-white p-5 lg:sticky lg:top-24 lg:self-start">
          <QuestionPalette
            states={states}
            current={question.number}
            onJump={(n) => setIndex(section.questions.findIndex((q) => q.number === n))}
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
        className="rounded-2xl bg-white px-8 py-4 text-lg font-black text-play-purple"
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
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
         className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-md rounded-3xl bg-white p-6">
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
          <button onClick={onCancel} className="flex-1 rounded-2xl border-2 border-black/15 px-5 py-3 font-bold">
            Go back
          </button>
          <button onClick={onConfirm} className="flex-1 rounded-2xl bg-play-purple px-5 py-3 font-black text-white">
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
  const style =
    tone === 'primary' ? 'bg-play-purple text-white hover:bg-play-purple-deep border-play-purple'
    : tone === 'mark' ? 'border-marked text-marked hover:bg-marked/10'
    : tone === 'next' ? 'border-play-green text-play-green hover:bg-play-green/10'
    : 'border-black/15 text-ink-soft hover:border-black/30'
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`rounded-2xl border-2 px-5 py-2.5 text-sm font-bold transition disabled:opacity-40 ${style} ${className}`}
    >
      {children}
    </button>
  )
}
