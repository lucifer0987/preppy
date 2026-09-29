import {
  SCHEDULE, SCHEDULE_DAYS, SCHEDULE_FIRST, SCHEDULE_LAST, nextScheduleDay,
  scheduleDayOn, schedulePatterns,
  type ScheduleDay, type ScheduleSection, type ScheduleSubject,
} from '../lib/schedule'

/**
 * The timetable, drawn twice.
 *
 * A real table from `md` up, because that is what the plan is -- eighty-four
 * rows against six columns, and the comparison down a column ("what is Quant
 * doing the week I am on Networks?") is the reason anybody opens it. Under
 * `md` the same day becomes a stacked card: six columns of prose on a phone is
 * a sideways scroll on every row, and a timetable you have to drag is one
 * nobody checks.
 *
 * Both are rendered from the same `ScheduleDay`, and the cell contents are the
 * small components below so the two readings cannot drift apart.
 *
 * Server-rendered and static. `today` is passed in rather than read here so
 * this stays a pure function of its props and the tests can walk it to any
 * date in the plan.
 */
export function ScheduleTable({ today }: { today: string }) {
  return (
    <div className="mt-6 space-y-8">
      {SCHEDULE.map((section) => (
        <Section key={section.name} section={section} today={today} />
      ))}
    </div>
  )
}

function Section({ section, today }: { section: ScheduleSection; today: string }) {
  const live = section.days.some((d) => d.date === today)
  return (
    <section id={anchorOf(section)} className="scroll-mt-24">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-black tracking-tight">{section.name}</h2>
        {/* Its own line on a phone, beside the title from sm up. Sharing the
            row with the date range left it a ten-character column. */}
        {section.subjects && (
          <p className="order-last w-full text-sm text-ink-soft sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
            {section.subjects}
          </p>
        )}
        <p className="numeral ml-auto text-xs text-ink-faint sm:ml-0">
          Days {section.from}&ndash;{section.to} &middot; {section.dates}
        </p>
        {live && <span className="chip border-accent/30 bg-accent-soft text-accent">You are here</span>}
      </header>

      {/* The table. Wide on purpose: the syllabus detail is the column that
          earns the width, and the shell is 120rem. */}
      <div className="mt-3 hidden overflow-hidden rounded-card border border-line bg-surface md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: '68rem' }}>
            <thead>
              <tr className="border-b border-line bg-surface-sunken">
                <Head className="w-28">Day</Head>
                <Head className="w-52">Test</Head>
                <Head>PK (Professional Knowledge)</Head>
                <Head className="w-48">Quant &amp; DI</Head>
                <Head className="w-48">Reasoning</Head>
                <Head className="w-48">English</Head>
              </tr>
            </thead>
            <tbody>
              {section.days.map((day) => <Row key={day.day} day={day} today={today} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* The phone reading of the same days. */}
      <ul className="mt-3 space-y-2 md:hidden">
        {section.days.map((day) => <Card key={day.day} day={day} today={today} />)}
      </ul>
    </section>
  )
}

function Row({ day, today }: { day: ScheduleDay; today: string }) {
  const now = day.date === today
  // A day with no QRE columns is not an empty row -- it is a day whose PK cell
  // is the whole of it, so it spans them rather than leaving three blanks.
  const spans = !day.quant && !day.reasoning && !day.english
  return (
    <tr className={`border-b border-line align-top last:border-0 ${
      now ? 'bg-accent-soft/60' : 'even:bg-surface-sunken/40'}`}>
      <td className="px-3 py-3">
        <DayName day={day} now={now} />
      </td>
      <td className="px-3 py-3">
        <TestName day={day} />
      </td>
      <td className="px-3 py-3" colSpan={spans ? 4 : 1}>
        <Pk day={day} />
      </td>
      {!spans && (
        <>
          <td className="px-3 py-3"><Subject subject={day.quant} /></td>
          <td className="px-3 py-3"><Subject subject={day.reasoning} /></td>
          <td className="px-3 py-3"><Subject subject={day.english} /></td>
        </>
      )}
    </tr>
  )
}

function Card({ day, today }: { day: ScheduleDay; today: string }) {
  const now = day.date === today
  return (
    <li className={`card p-4 ${now ? 'border-accent/45 bg-accent-soft/50' : ''}`}>
      <div className="flex items-baseline gap-2.5">
        <span className={`numeral text-sm font-bold ${now ? 'text-accent' : 'text-ink'}`}>
          D{day.day}
        </span>
        <span className="numeral text-xs text-ink-faint">{day.label}</span>
        {now && (
          <span className="chip ml-auto border-accent/30 bg-accent-soft text-accent">Today</span>
        )}
      </div>
      <div className="mt-2.5"><TestName day={day} /></div>
      <dl className="mt-3 space-y-2.5 border-t border-line pt-3">
        <Field label="PK (Professional Knowledge)"><Pk day={day} /></Field>
        {day.quant && <Field label="Quant &amp; DI"><Subject subject={day.quant} /></Field>}
        {day.reasoning && <Field label="Reasoning"><Subject subject={day.reasoning} /></Field>}
        {day.english && <Field label="English"><Subject subject={day.english} /></Field>}
      </dl>
    </li>
  )
}

/* ------------------------------------------------------------------ cells */

function DayName({ day, now }: { day: ScheduleDay; now: boolean }) {
  return (
    <>
      <span className={`numeral block text-sm font-bold ${now ? 'text-accent' : 'text-ink'}`}>
        D{day.day}
      </span>
      <span className="numeral mt-0.5 block whitespace-nowrap text-xs text-ink-faint">{day.label}</span>
      {now && <span className="chip mt-1.5 border-accent/30 bg-accent-soft text-accent">Today</span>}
    </>
  )
}

function TestName({ day }: { day: ScheduleDay }) {
  // On a topic day the plan writes the same words in both columns. Saying it
  // once leaves the Test column doing what only it can -- naming the syllabus
  // slot and the pattern -- and gives the width back to the syllabus itself.
  const echoesPk = day.test === day.pk.topic && Boolean(day.code)
  return (
    <>
      <span className="block font-bold text-ink">
        {day.code && <span className="text-accent">{day.code}{echoesPk ? '' : ': '}</span>}
        {!echoesPk && day.test}
      </span>
      {day.pattern && (
        <span className="mt-1 block text-xs font-semibold text-ink-soft">{day.pattern}</span>
      )}
    </>
  )
}

function Pk({ day }: { day: ScheduleDay }) {
  const { topic, source, plan, detail } = day.pk
  // In the plan's own order: the topic, where it sits in its subject, what the
  // day is made of, then the sub-topics in smaller print. A day carries either
  // a topic or a plan, and the exam day carries both.
  return (
    <>
      {topic && <span className="block font-bold text-ink">{topic}</span>}
      {source && <span className="mt-0.5 block text-xs text-ink-faint">{source}</span>}
      {plan && <span className={`block leading-relaxed text-ink ${topic ? 'mt-1 text-xs text-ink-soft' : ''}`}>{plan}</span>}
      {detail && <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{detail}</span>}
    </>
  )
}

function Subject({ subject }: { subject?: ScheduleSubject }) {
  if (!subject) return <span className="text-ink-faint">&mdash;</span>
  return (
    <>
      <span className="block text-ink">{subject.item}</span>
      {subject.note && <span className="mt-0.5 block text-xs text-ink-faint">{subject.note}</span>}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function Head({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col"
        className={`px-3 py-2.5 text-left text-[0.625rem] font-bold uppercase
                    tracking-[0.12em] text-ink-faint ${className}`}>
      {children}
    </th>
  )
}

/** "Week 1" and "Phase 2" become #week-1 and #phase-2, for the jump links. */
export function anchorOf(section: ScheduleSection): string {
  return section.name.toLowerCase().replace(/\s+/g, '-')
}

/**
 * What sits above the table: where today falls in the plan, what the patterns
 * mean, and a way to reach a week without scrolling past the ones before it.
 *
 * The pattern legend is counted from the days rather than written out, because
 * the PDF put its legend on a cover page and a legend that repeats the table
 * in prose is the first thing to go stale.
 */
export function ScheduleIntro({ today }: { today: string }) {
  const day = scheduleDayOn(today)
  const next = day ? null : nextScheduleDay(today)
  const done = SCHEDULE_DAYS.filter((d) => d.date < today).length

  return (
    <div className="mt-5 space-y-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line
                     bg-line sm:grid-cols-4">
        <Figure label="Today">
          {day ? `Day ${day.day} of ${SCHEDULE_DAYS.length}` : next ? 'Not started' : 'Finished'}
        </Figure>
        <Figure label="Days behind you">{done}</Figure>
        <Figure label="Days to the exam">{SCHEDULE_DAYS.length - done}</Figure>
        <Figure label="Runs">
          {formatSpan(SCHEDULE_FIRST)} &ndash; {formatSpan(SCHEDULE_LAST)}
        </Figure>
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="eyebrow">Patterns</span>
        {schedulePatterns().map(({ pattern, days }) => (
          <span key={pattern} className="text-sm text-ink-soft">
            <span className="font-bold text-ink">{pattern.split(' · ')[0]}</span>
            {' — '}{pattern.split(' · ').slice(1).join(' · ')}
            <span className="text-ink-faint"> ({days} days)</span>
          </span>
        ))}
      </div>

      {/* The row gap is a tap-target decision, not a spacing one.
          These pills are 26px tall and .tap-target centres a 44px hit box on
          each, so two wrapped rows 32px apart have overlapping hit boxes and
          each pill ends up with 32px of the 44. Twenty pixels between rows
          separates them, and only on a coarse pointer: a mouse needs no help
          and the desktop spacing was chosen deliberately. */}
      <nav aria-label="Jump to a week"
           className="flex flex-wrap gap-1.5 pointer-coarse:gap-y-5">
        {SCHEDULE.map((s) => {
          const here = s.days.some((d) => d.date === today)
          return (
            <a key={s.name} href={`#${anchorOf(s)}`}
               className={[
                 'tap-target rounded-pill border px-3 py-1 text-xs font-bold transition',
                 here
                   ? 'border-accent/40 bg-accent-soft text-accent'
                   : 'border-line-strong text-ink-soft hover:border-accent hover:text-accent',
               ].join(' ')}>
              {s.name}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="numeral mt-0.5 text-base font-bold">{children}</dd>
    </div>
  )
}

/** "28 Sep 2026". Short, because it sits beside three other figures. */
function formatSpan(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1]
  return `${d} ${month} ${y}`
}
