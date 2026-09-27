import { OPTION_LABELS, type OptionLabel, type PaperQuestion } from '../lib/types'

/**
 * A question as the live test engine has it: no answer, no solution. Making
 * the key optional in the type means a component cannot accidentally render
 * something the server never sent (FR-13.1).
 */
export type RenderableQuestion =
  Omit<PaperQuestion, 'answer' | 'solution'> & { answer?: OptionLabel; solution?: string }
import { OptionShape } from './OptionShape'
import { PaperImages } from './PaperImages'

/**
 * One question with its option cards.
 *
 * Used by three surfaces so they cannot drift apart: the admin preview, the
 * live test engine, and the answer review. `reveal` is what separates them —
 * during a live test the correct answer is never even sent to the client
 * (FR-13.1), so this component simply never receives it.
 */
export function QuestionCard({
  question,
  testId,
  selected = null,
  reveal = false,
  disabled = true,
  onSelect,
}: {
  question: RenderableQuestion
  /** Needed to show the question's images. */
  testId?: string
  selected?: OptionLabel | null
  /** Show which option is correct. Never true during a live attempt. */
  reveal?: boolean
  disabled?: boolean
  onSelect?: (label: OptionLabel) => void
}) {
  const present = OPTION_LABELS.filter((l) => question.options[l] !== undefined)
  // Revealing without a key would silently mark every option wrong.
  const canReveal = reveal && question.answer !== undefined

  return (
    <div>
      {/* prose-question caps the measure near 68 characters: a full-width line
          of comprehension text is measurably slower to read, and this is read
          under a clock. */}
      <p className="prose-question text-ink sm:text-[1.0625rem] sm:leading-[1.7]">
        <span className="numeral mr-2.5 align-baseline text-sm font-bold text-accent">
          Q{question.number}
        </span>
        {question.text}
      </p>
      {testId && <PaperImages testId={testId} names={question.images} />}

      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {present.map((label) => {
          const isCorrect = canReveal && question.answer === label
          const isWrongPick = canReveal && selected === label && question.answer !== label
          const isSelected = selected === label

          return (
            <li key={label}>
              <button
                type="button"
                disabled={disabled}
                onClick={onSelect ? () => onSelect(label) : undefined}
                aria-pressed={isSelected}
                className={[
                  'group flex w-full items-start gap-3.5 rounded-control border-2 px-4 py-3.5 text-left',
                  'transition disabled:cursor-default',
                  isCorrect ? 'border-answered bg-answered/10 font-semibold'
                    : isWrongPick ? 'border-notanswered bg-notanswered/10'
                    : isSelected ? 'border-accent bg-accent-soft font-semibold shadow-low'
                    : 'border-line bg-surface',
                  disabled ? '' : 'hover:border-accent/60 hover:bg-surface-sunken active:translate-y-px',
                ].join(' ')}
              >
                <span className="mt-0.5 flex shrink-0 items-center gap-2">
                  <OptionShape label={label} />
                  <span className="numeral w-4 text-xs font-bold text-ink-faint">{label}</span>
                </span>
                <span className="flex-1 leading-relaxed">{question.options[label]}</span>
                {isCorrect && (
                  <span className="chip shrink-0 border-answered/30 bg-answered/15 text-good-ink">Correct</span>
                )}
                {isWrongPick && (
                  <span className="chip shrink-0 border-notanswered/30 bg-notanswered/15 text-bad-ink">
                    Your answer
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {canReveal && (
        <div className="mt-4 rounded-control border border-line bg-surface-sunken p-4">
          <p className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Answer</span>
            <span className="chip border-good/35 bg-good/10 font-display text-good-ink">
              {question.answer}
            </span>
          </p>
          {question.solution && (
            <p className="measure mt-2.5 leading-relaxed text-ink">{question.solution}</p>
          )}
          {(question.tag || question.difficulty) && (
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5
                          text-xs text-ink-faint">
              {question.tag && <span>Topic: {question.tag}</span>}
              {question.difficulty && <span>Difficulty: {question.difficulty}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
