import { OPTION_LABELS, type OptionLabel, type PaperQuestion } from '../lib/types'
import { OptionShape } from './OptionShape'

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
  selected = null,
  reveal = false,
  disabled = true,
  onSelect,
}: {
  question: PaperQuestion
  selected?: OptionLabel | null
  /** Show which option is correct. Never true during a live attempt. */
  reveal?: boolean
  disabled?: boolean
  onSelect?: (label: OptionLabel) => void
}) {
  const present = OPTION_LABELS.filter((l) => question.options[l] !== undefined)

  return (
    <div>
      <p className="text-lg leading-relaxed">
        <span className="mr-2 font-mono text-sm text-ink-soft">Q{question.number}.</span>
        {question.text}
      </p>

      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {present.map((label) => {
          const isCorrect = reveal && question.answer === label
          const isWrongPick = reveal && selected === label && question.answer !== label
          const isSelected = selected === label

          return (
            <li key={label}>
              <button
                type="button"
                disabled={disabled}
                onClick={onSelect ? () => onSelect(label) : undefined}
                aria-pressed={isSelected}
                className={[
                  'flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition',
                  'disabled:cursor-default',
                  isCorrect ? 'border-answered bg-answered/10 font-semibold'
                    : isWrongPick ? 'border-notanswered bg-notanswered/10'
                    : isSelected ? 'border-play-purple bg-play-purple/10 font-semibold'
                    : 'border-black/10 bg-white',
                  disabled ? '' : 'hover:border-play-purple/60',
                ].join(' ')}
              >
                <OptionShape label={label} />
                <span className="font-mono text-xs text-ink-soft">{label}</span>
                <span className="flex-1">{question.options[label]}</span>
                {isCorrect && <span className="text-xs font-bold uppercase text-answered">Correct</span>}
                {isWrongPick && <span className="text-xs font-bold uppercase text-notanswered">Your answer</span>}
              </button>
            </li>
          )
        })}
      </ul>

      {reveal && (
        <div className="mt-4 rounded-2xl bg-black/[0.04] p-4 text-sm">
          <p><span className="font-bold">Answer:</span> {question.answer}</p>
          {question.solution && <p className="mt-1 text-ink-soft">{question.solution}</p>}
          <p className="mt-2 flex flex-wrap gap-3 text-xs text-ink-soft">
            {question.tag && <span>Topic: {question.tag}</span>}
            {question.difficulty && <span>Difficulty: {question.difficulty}</span>}
          </p>
        </div>
      )}
    </div>
  )
}
