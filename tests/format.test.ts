import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import { FIELDS, readPaper, readQuestion, summarise } from '../lib/paper'
import { buildTemplate } from '../lib/template'
import {
  DEFAULT_PATTERN, patternBands, patternTotals, uniformMarking, type Pattern,
} from '../lib/types'

const sampleJson = readFileSync('format/sample.json', 'utf8')
const templateJson = readFileSync('format/template.json', 'utf8')
const schema = JSON.parse(readFileSync('format/schema.json', 'utf8'))

const ok = (src: string, opts = {}) => {
  const r = readPaper(src, opts)
  return { ...r, ...summarise(r.issues), codes: r.issues.map((i) => i.code) }
}
/** Mutate the sample via a plain object edit and re-serialise. */
const mutate = (fn: (p: any) => void) => {
  const p = JSON.parse(sampleJson)
  fn(p)
  return JSON.stringify(p)
}

describe('the shipped format kit', () => {
  it('sample.json is publishable', () => {
    const r = ok(sampleJson)
    expect(r.errors, r.errors.map((e) => `${e.path}: ${e.message}`).join('\n')).toHaveLength(0)
    expect(r.paper!.sections.flatMap((s) => s.questions)).toHaveLength(55)
  })

  it('template.json is refused only for its placeholder text, so a filled-in copy starts valid', () => {
    const r = ok(templateJson)
    expect(r.publishable).toBe(false)
    const other = r.errors.filter((e) => e.code !== 'PLACEHOLDER_TEXT')
    expect(other, other.map((e) => `${e.path}: ${e.message}`).join('\n')).toHaveLength(0)
    // Every question, the directions block and the title are flagged.
    expect(r.errors.filter((e) => /questions\[\d+\]$/.test(e.path ?? ''))).toHaveLength(55)
    expect(r.errors.map((e) => e.path)).toContain('title')
    expect(r.errors.map((e) => e.path)).toContain('sections[0].directions[0]')
  })

  it('does not mistake real text beginning "Replace" for a placeholder', () => {
    const r = ok(mutate((p) => {
      p.sections[2].questions[0].text = 'Replace with the correct phrase: he do not like it.'
    }))
    expect(r.codes).not.toContain('PLACEHOLDER_TEXT')
  })

  it('every answer key names an option that exists', () => {
    for (const s of ok(sampleJson).paper!.sections) {
      for (const q of s.questions) {
        expect(Object.keys(q.options), `Q${q.number}`).toContain(q.answer)
      }
    }
  })

  it('both agree with schema.json', () => {
    const ajv = new (Ajv as any)({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    for (const src of [sampleJson, templateJson]) {
      expect(validate(JSON.parse(src)), JSON.stringify(validate.errors)).toBe(true)
    }
  })

  it('lists the same fields as schema.json at every level', () => {
    const props = (o: any) => Object.keys(o.properties).sort()
    expect([...FIELDS.document].sort()).toEqual(props(schema))
    expect([...FIELDS.section].sort()).toEqual(props(schema.$defs.section))
    expect([...FIELDS.directions].sort()).toEqual(props(schema.$defs.directions))
    expect([...FIELDS.table].sort()).toEqual(props(schema.$defs.table))
    expect([...FIELDS.question].sort()).toEqual(props(schema.$defs.question))
  })

  it('refuses whatever schema.json refuses', () => {
    const ajv = new (Ajv as any)({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    const cases: [string, (p: any) => void][] = [
      ['unknown top-level key', (p) => { p.titel = 'x' }],
      ['unknown section key', (p) => { p.sections[0].direction = p.sections[0].directions; delete p.sections[0].directions }],
      ['unknown directions key', (p) => { p.sections[0].directions[0].note = 'x' }],
      ['unknown table key', (p) => { p.sections[0].directions[0].table.caption = 'x' }],
      ['unknown question key', (p) => { p.sections[0].questions[0].answr = 'A' }],
      ['empty table headers', (p) => { p.sections[0].directions[0].table = { headers: [], rows: [] } }],
      ['empty difficulty', (p) => { p.sections[0].questions[0].difficulty = '' }],
      ['text that is only spaces', (p) => { p.sections[0].questions[0].text = '             ' }],
      ['short text padded with spaces', (p) => { p.sections[0].questions[0].text = '   short   ' }],
      ['blank directions text', (p) => { p.sections[0].directions[0].text = '   ' }],
      ['blank option', (p) => { p.sections[0].questions[0].options.A = ' ' }],
    ]
    for (const [name, fn] of cases) {
      const src = mutate(fn)
      expect(validate(JSON.parse(src)), `schema should refuse: ${name}`).toBe(false)
      expect(ok(src).publishable, `validator should refuse: ${name}`).toBe(false)
    }
  })

  it('leaves the section order to the app, which is the only one that knows', () => {
    // schema.json is an editor's checker and has no idea which exam a file is
    // for, so it cannot say that Reasoning comes second -- on some tracks it
    // does not. It accepts any of the six codes in any order; the app checks
    // the file against the pattern of the exam it is being uploaded for.
    const ajv = new (Ajv as any)({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    const reversed = mutate((p: any) => { p.sections.reverse() })
    expect(validate(JSON.parse(reversed))).toBe(true)
    expect(ok(reversed).publishable).toBe(false)
  })

  it('keeps the DI table as structured data, not aligned text', () => {
    const p = ok(sampleJson).paper!
    const table = p.sections[0]!.directions![0]!.table!
    expect(table.headers).toEqual(['Year', 'Java', 'Python', 'DBMS', 'Networking'])
    expect(table.rows).toHaveLength(3)
    expect(table.rows.every((r) => r.length === table.headers.length)).toBe(true)
  })

  it('numbers every question inside its section band', () => {
    const p = ok(sampleJson).paper!
      const bands = patternBands(DEFAULT_PATTERN)
    for (const s of p.sections) {
      const band = bands.find((x) => x.code === s.code)!
      for (const q of s.questions) {
        expect(q.number).toBeGreaterThanOrEqual(band.from)
        expect(q.number).toBeLessThanOrEqual(band.to)
      }
    }
  })
})

describe('reading the file', () => {
  it('accepts a UTF-8 byte order mark, which some editors write', () => {
    expect(ok('\uFEFF' + sampleJson).publishable).toBe(true)
  })

  it('parses strictly: curly quotes and trailing commas are errors, not repaired', () => {
    for (const src of ['{“format”: “preppy-paper”}', '{"format": "preppy-paper",}']) {
      const r = ok(src)
      expect(r.codes).toContain('JSON_INVALID')
      expect(r.issues[0]!.message).toMatch(/line \d+, column \d+/)
    }
  })
})

describe('blocking errors', () => {
  it('rejects a file with no JSON in it', () => {
    const r = ok('This is just a scanned page of prose with no JSON anywhere.')
    expect(r.codes).toContain('NOT_JSON')
    expect(r.publishable).toBe(false)
  })

  it('reports unreadable JSON with a line and column', () => {
    const r = ok('{"format": "preppy-paper", "version": }')
    expect(r.codes).toContain('JSON_INVALID')
    expect(r.issues[0]!.message).toMatch(/line \d+, column \d+/)
  })

  it('rejects the wrong format marker', () => {
    expect(ok(mutate((p) => { p.format = 'something-else' })).codes).toContain('FORMAT_WRONG')
  })

  it('rejects the wrong version', () => {
    expect(ok(mutate((p) => { p.version = 2 })).codes).toContain('VERSION_WRONG')
  })

  it('rejects a malformed date', () => {
    expect(ok(mutate((p) => { p.date = '26/09/2026' })).codes).toContain('DATE_MALFORMED')
  })

  it('rejects a date that does not exist on the calendar', () => {
    for (const d of ['2026-02-31', '2026-13-01', '2026-04-31', '2027-02-29']) {
      expect(ok(mutate((p) => { p.date = d })).codes, d).toContain('DATE_INVALID')
    }
    expect(ok(mutate((p) => { p.date = '2028-02-29' })).codes).not.toContain('DATE_INVALID')
  })

  it('rejects a date that already has a paper', () => {
    expect(ok(sampleJson, { takenDates: ['2026-09-26'] }).codes).toContain('DATE_TAKEN')
  })

  it('rejects a missing answer', () => {
    expect(ok(mutate((p) => { delete p.sections[0].questions[0].answer })).codes).toContain('ANSWER_MISSING')
  })

  it('reports a missing answer even when the options are missing too', () => {
    // Reporting one error at a time would make the admin fix, re-run, and only
    // then discover the next problem.
    const r = ok(mutate((p) => {
      delete p.sections[0].questions[0].options
      delete p.sections[0].questions[0].answer
    }))
    expect(r.codes).toContain('OPTIONS_MISSING')
    expect(r.codes).toContain('ANSWER_MISSING')
  })

  it('rejects an answer naming an option that does not exist', () => {
    const r = ok(mutate((p) => {
      p.sections[0].questions[0].answer = 'E'
      delete p.sections[0].questions[0].options.E
    }))
    expect(r.codes).toContain('ANSWER_NOT_AN_OPTION')
  })

  it('rejects options with a gap in the letters', () => {
    expect(ok(mutate((p) => { delete p.sections[0].questions[0].options.B })).codes).toContain('OPTION_NOT_CONTIGUOUS')
  })

  it('rejects a question number outside its section band', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].number = 42 })).codes).toContain('NUMBER_OUT_OF_BAND')
  })

  it('rejects a gap in the numbering', () => {
    expect(ok(mutate((p) => { p.sections[1].questions[0].number = 99 })).codes).toContain('QUESTION_GAP')
  })

  it('rejects a duplicate question number', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[1].number = 1 })).codes).toContain('QUESTION_DUPLICATE')
  })

  it('rejects the wrong question count in a section', () => {
    expect(ok(mutate((p) => { p.sections[0].questions.pop() })).codes).toContain('SECTION_COUNT')
  })

  it('rejects a missing section', () => {
    expect(ok(mutate((p) => { p.sections = p.sections.slice(0, 3) })).codes).toContain('SECTION_MISSING')
  })

  it('rejects an unknown section code', () => {
    expect(ok(mutate((p) => { p.sections[3].code = 'COMPUTERS' })).codes).toContain('SECTION_UNKNOWN')
  })

  it('rejects question text lost in extraction', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].text = '' })).codes).toContain('TEXT_EMPTY')
  })

  it('rejects a directions range that does not match the questions present', () => {
    expect(ok(mutate((p) => { p.sections[0].directions[0].to = 20 })).codes).toContain('DIRECTIONS_RANGE_UNMATCHED')
  })

  it('rejects a table row that is the wrong width', () => {
    expect(ok(mutate((p) => { p.sections[0].directions[0].table.rows[0].push('extra') })).codes).toContain('TABLE_ROW_WIDTH')
  })

  it('accepts a paper longer than the default, and rejects one no day could hold', () => {
    // Whether a paper fits its night is settled when it is scheduled, against
    // the window chosen there. The validator only stops a typo.
    expect(ok(mutate((p) => { p.sections[3].durationMinutes = 20 })).codes).not.toContain('DURATION_TOTAL')
    expect(ok(mutate((p) => { p.sections[3].durationMinutes = 170 })).codes).not.toContain('DURATION_TOTAL')

    const tooLong = ok(mutate((p) => {
      for (const s of p.sections) s.durationMinutes = 180
    }))
    expect(tooLong.codes).toContain('DURATION_TOTAL')
  })

  it('warns, without blocking, about a date that has passed', () => {
    const r = ok(sampleJson, { today: '2027-01-01' })
    expect(r.codes).toContain('DATE_PAST')
    expect(r.publishable).toBe(true)
    expect(ok(sampleJson, { today: '2026-01-01' }).codes).not.toContain('DATE_PAST')
  })

  it('rejects an image that was not uploaded', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].images = ['figure.png'] })).codes).toContain('IMAGE_MISSING')
  })

  it('accepts an image that was uploaded', () => {
    const r = ok(mutate((p) => { p.sections[0].questions[0].images = ['figure.png'] }), { availableImages: ['figure.png'] })
    expect(r.codes).not.toContain('IMAGE_MISSING')
    expect(r.publishable).toBe(true)
  })

  it('rejects an image name that cannot be a safe file name, in the validator and the schema', () => {
    const ajv = new (Ajv as any)({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    for (const bad of ['../secret.png', 'DI chart (1).png', 'figure.svg', '.hidden.png', 'no-extension']) {
      const src = mutate((p) => { p.sections[0].directions[0].images = [bad] })
      expect(ok(src, { availableImages: [bad] }).codes, bad).toContain('IMAGE_NAME')
      expect(validate(JSON.parse(src)), bad).toBe(false)
    }
    const good = mutate((p) => { p.sections[0].directions[0].images = ['DI-chart_1.JPG'] })
    expect(ok(good, { availableImages: ['DI-chart_1.JPG'] }).publishable).toBe(true)
    expect(validate(JSON.parse(good))).toBe(true)
  })

  it('rejects an unknown key rather than silently dropping it', () => {
    const r = ok(mutate((p) => {
      p.sections[0].direction = p.sections[0].directions
      delete p.sections[0].directions
    }))
    const issue = r.issues.find((i) => i.code === 'UNKNOWN_FIELD')!
    expect(issue.path).toBe('sections[0].direction')
    expect(issue.message).toMatch(/Did you mean "directions"/)
    expect(r.publishable).toBe(false)
  })

  it('rejects unknown keys at every level', () => {
    const paths = ok(mutate((p) => {
      p.extra = 1
      p.sections[1].extra = 1
      p.sections[0].directions[0].extra = 1
      p.sections[0].directions[0].table.extra = 1
      p.sections[0].questions[2].extra = 1
    })).issues.filter((i) => i.code === 'UNKNOWN_FIELD').map((i) => i.path)
    expect(paths).toEqual(expect.arrayContaining([
      'extra', 'sections[1].extra', 'sections[0].directions[0].extra',
      'sections[0].directions[0].table.extra', 'sections[0].questions[2].extra',
    ]))
  })

  it('rejects sections out of order', () => {
    const r = ok(mutate((p) => { [p.sections[0], p.sections[1]] = [p.sections[1], p.sections[0]] }))
    expect(r.codes).toContain('SECTION_ORDER')
    expect(r.publishable).toBe(false)
  })

  it('rejects a fifth section', () => {
    expect(ok(mutate((p) => { p.sections.push({ ...p.sections[3] }) })).codes).toContain('SECTION_EXTRA')
  })

  it('rejects overlapping directions ranges', () => {
    const r = ok(mutate((p) => {
      p.sections[0].directions.push({ from: 8, to: 12, text: 'A second block over part of the first.' })
    }))
    expect(r.codes).toContain('DIRECTIONS_OVERLAP')
  })

  it('rejects two directions blocks starting at the same question', () => {
    const r = ok(mutate((p) => {
      const d = p.sections[0].directions[0]
      p.sections[0].directions.push({ from: d.from, to: d.from, text: 'Same start.' })
    }))
    expect(r.codes).toContain('DIRECTIONS_OVERLAP')
  })

  it('accepts directions ranges that touch without overlapping', () => {
    const r = ok(mutate((p) => {
      p.sections[0].directions = [
        { from: 1, to: 5, text: 'First block.' },
        { from: 6, to: 10, text: 'Second block.' },
      ]
    }))
    expect(r.codes).not.toContain('DIRECTIONS_OVERLAP')
    expect(r.publishable).toBe(true)
  })

  it('rejects a table with no headers', () => {
    const r = ok(mutate((p) => { p.sections[0].directions[0].table = { headers: [], rows: [] } }))
    expect(r.codes).toContain('TABLE_HEADERS')
  })

  it('rejects question text that is long enough only because of spaces', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].text = '    short    ' })).codes).toContain('TEXT_EMPTY')
  })

  it('rejects an empty difficulty, which the database would refuse', () => {
    const r = ok(mutate((p) => { p.sections[0].questions[0].difficulty = '' }))
    expect(r.codes).toContain('DIFFICULTY_INVALID')
    expect(r.codes).not.toContain('DIFFICULTY_MISSING')
  })

  it('rejects placeholder text left over from the template', () => {
    const r = ok(mutate((p) => { p.sections[0].questions[4].options.C = 'Replace with option C' }))
    const issue = r.issues.find((i) => i.code === 'PLACEHOLDER_TEXT')!
    expect(issue.path).toBe('sections[0].questions[4]')
    expect(issue.message).toContain('options.C')
    expect(r.publishable).toBe(false)
  })

  it('rejects an invalid difficulty', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].difficulty = 'Tricky' })).codes).toContain('DIFFICULTY_INVALID')
  })
})

describe('one question on its own', () => {
  const q = () => JSON.parse(sampleJson).sections[0].questions[0]

  it('accepts a question from the sample', () => {
    expect(summarise(readQuestion(q(), 'QUANT')).publishable).toBe(true)
  })

  it('applies the same rules as a full upload', () => {
    const codes = (x: unknown, code: 'QUANT' | 'PK' = 'QUANT') => readQuestion(x, code).map((i) => i.code)
    expect(codes({ ...q(), text: 'short' })).toContain('TEXT_EMPTY')
    expect(codes({ ...q(), options: { ...q().options, B: '' } })).toContain('OPTION_EMPTY')
    expect(codes({ ...q(), solution: 'Replace with the worked explanation. Optional.' })).toContain('PLACEHOLDER_TEXT')
    expect(codes({ ...q(), soluton: 'x' })).toContain('UNKNOWN_FIELD')
    // Not the band, though: editing one question cannot know where its section
    // starts, and the editor writes only text, options and solution -- the
    // number comes from the stored row and cannot be changed.
    expect(codes(q(), 'PK')).not.toContain('NUMBER_OUT_OF_BAND')
  })

  it('checks images against those already stored', () => {
    const withImage = { ...q(), images: ['fig.png'] }
    expect(readQuestion(withImage, 'QUANT').map((i) => i.code)).toContain('IMAGE_MISSING')
    expect(summarise(readQuestion(withImage, 'QUANT', { availableImages: ['fig.png'] })).publishable).toBe(true)
  })
})

describe('warnings do not block', () => {
  it('allows a paper with no solutions, tags or difficulty', () => {
    const r = ok(mutate((p) => {
      for (const s of p.sections) for (const q of s.questions) { delete q.solution; delete q.tag; delete q.difficulty }
    }))
    expect(r.codes).toContain('SOLUTION_MISSING')
    expect(r.publishable).toBe(true)
  })

  it('allows four options with a warning', () => {
    const r = ok(mutate((p) => {
      const q = p.sections[0].questions[0]
      delete q.options.E
      if (q.answer === 'E') q.answer = 'A'
    }))
    expect(r.codes).toContain('OPTION_UNDER_FIVE')
    expect(r.publishable).toBe(true)
  })
})

describe('a file whose sections are out of order', () => {
  it('is refused, and each section is still measured against its own target', () => {
    // Order is a blocking error on its own. What matters here is that the
    // counts are read by code: matched by position, QUANT would be checked
    // against English's ten and every section would report a spurious size.
    const swapped = mutate((p) => {
      const [q, r, e, k] = p.sections
      p.sections = [e, r, q, k]
    })
    const r = ok(swapped)
    expect(r.codes).toContain('SECTION_ORDER')
    expect(r.codes).not.toContain('SECTION_COUNT')
    expect(r.codes).not.toContain('TOTAL_COUNT')
  })
})

describe('a template built from a pattern', () => {
  const build = (p: Pattern) => JSON.stringify(buildTemplate(p))

  it('matches the shipped file when built from the shipped pattern', () => {
    expect(JSON.parse(build(DEFAULT_PATTERN))).toEqual(JSON.parse(templateJson))
  })

  it('fails only on its placeholders, for any pattern', () => {
    const patterns: Pattern[] = [
      DEFAULT_PATTERN,
      [{ code: 'QUANT', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
       { code: 'REASONING', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
       { code: 'ENGLISH', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
       { code: 'PK', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 }],
      // A section too small for the worked directions block, and uneven counts.
      [{ code: 'QUANT', questions: 3, minutes: 5, marksCorrect: 1, marksNegative: 0 },
       { code: 'REASONING', questions: 25, minutes: 30, marksCorrect: 1, marksNegative: 0.25 },
       { code: 'ENGLISH', questions: 1, minutes: 1, marksCorrect: 5, marksNegative: 1.25 },
       { code: 'PK', questions: 40, minutes: 44, marksCorrect: 0.5, marksNegative: 0.1 }],
    ]
    for (const pattern of patterns) {
      const codes = new Set(ok(build(pattern), { pattern }).issues
        .filter((i) => i.severity === 'error').map((i) => i.code))
      expect(codes, JSON.stringify(patternTotals(pattern))).toEqual(new Set(['PLACEHOLDER_TEXT']))
    }
  })

  it('numbers straight through, whatever the counts', () => {
    const odd: Pattern = [
      { code: 'QUANT', questions: 3, minutes: 5, marksCorrect: 1, marksNegative: 0 },
      { code: 'REASONING', questions: 25, minutes: 30, marksCorrect: 1, marksNegative: 0.25 },
      { code: 'ENGLISH', questions: 1, minutes: 1, marksCorrect: 5, marksNegative: 1.25 },
      { code: 'PK', questions: 40, minutes: 44, marksCorrect: 0.5, marksNegative: 0.1 },
    ]
    const numbers = (JSON.parse(build(odd)).sections as { questions: { number: number }[] }[])
      .flatMap((s) => s.questions.map((q) => q.number))
    expect(numbers).toEqual(Array.from({ length: 69 }, (_, i) => i + 1))
  })

  it('leaves out the worked directions block when the section is too small for it', () => {
    // It covers five questions; a three-question section cannot spare them, and
    // a block naming questions that do not exist would be a blocking error.
    const tiny: Pattern = DEFAULT_PATTERN.map((s) => ({ ...s, questions: 4 }))
    const built = JSON.parse(build(tiny)) as { sections: Record<string, unknown>[] }
    expect(built.sections.some((s) => 'directions' in s)).toBe(false)
  })
})

describe('the shipped files stand on their own', () => {
  // They state questionCount, durationMinutes and the marking, so they are
  // judged on what they say rather than on whatever the console's default
  // pattern has been changed to. Without that, changing the pattern would
  // make the sample paper we tell people to copy stop validating.
  const ODD: Pattern = [
    { code: 'QUANT', questions: 7, minutes: 20, marksCorrect: 3, marksNegative: 1 },
    { code: 'REASONING', questions: 7, minutes: 20, marksCorrect: 3, marksNegative: 1 },
    { code: 'ENGLISH', questions: 7, minutes: 20, marksCorrect: 3, marksNegative: 1 },
    { code: 'PK', questions: 7, minutes: 20, marksCorrect: 3, marksNegative: 1 },
  ]

  it('sample.json is publishable under any default pattern', () => {
    for (const pattern of [DEFAULT_PATTERN, ODD]) {
      const r = ok(sampleJson, { pattern })
      expect(r.issues.filter((i) => i.severity === 'error')).toEqual([])
      expect(r.publishable).toBe(true)
    }
  })

  it('template.json fails only on its placeholders, under any default pattern', () => {
    for (const pattern of [DEFAULT_PATTERN, ODD]) {
      const codes = new Set(ok(templateJson, { pattern }).issues
        .filter((i) => i.severity === 'error').map((i) => i.code))
      expect(codes).toEqual(new Set(['PLACEHOLDER_TEXT']))
    }
  })

  it('states a count that matches the array it ships', () => {
    for (const src of [sampleJson, templateJson]) {
      for (const s of JSON.parse(src).sections) {
        expect(s.questionCount).toBe(s.questions.length)
      }
    }
  })
})

describe('marks the database can actually keep', () => {
  it('accepts anything with two decimal places or fewer', () => {
    for (const v of [1, 0.5, 0.25, 0.33, 2.75, 10]) {
      expect(ok(mutate((p) => { p.sections[0].marksCorrect = v })).codes).not.toContain('MARKS_PRECISION')
    }
  })

  it('refuses more precision than numeric(4,2) can hold', () => {
    // Stored, 0.125 becomes 0.13 and every score is computed from that. A file
    // that says one thing while the paper does another is worse than a refusal.
    for (const v of [0.125, 1.005, 0.333]) {
      const r = ok(mutate((p) => { p.sections[0].marksCorrect = v }))
      expect(r.codes, String(v)).toContain('MARKS_PRECISION')
      expect(r.publishable).toBe(false)
    }
    expect(ok(mutate((p) => { p.sections[2].marksNegative = 0.005 })).codes).toContain('MARKS_PRECISION')
  })

  it('is not fooled by binary floating point', () => {
    // 0.07 * 100 is 7.000000000000001, and 0.29 * 100 is 28.999999999999996.
    for (const v of [0.07, 0.29, 0.57, 1.15, 4.35]) {
      expect(ok(mutate((p) => { p.sections[0].marksCorrect = v })).codes, String(v))
        .not.toContain('MARKS_PRECISION')
    }
  })
})

describe('describing a pattern', () => {
  it('reports one marking scheme when every section shares it', () => {
    expect(uniformMarking(DEFAULT_PATTERN)).toEqual({ correct: 1, negative: 0.25 })
  })

  it('reports none when a single section differs', () => {
    const mixed = DEFAULT_PATTERN.map((s, i) => i === 2 ? { ...s, marksCorrect: 2 } : s)
    expect(uniformMarking(mixed)).toBeNull()
  })

  it('rounds the totals rather than carrying floating-point noise', () => {
    // 0.1 a mark over 55 questions is the classic case: summed naively this is
    // 5.500000000000001, and a leaderboard that shows it looks broken.
    const tenths = DEFAULT_PATTERN.map((s) => ({ ...s, marksCorrect: 0.1, marksNegative: 0.1 }))
    const t = patternTotals(tenths)
    expect(t.maxMarks).toBe(5.5)
    expect(t.minMarks).toBe(-5.5)
  })

  it('has nothing to say about an empty pattern', () => {
    expect(uniformMarking([])).toBeNull()
    expect(patternTotals([])).toEqual({ questions: 0, minutes: 0, maxMarks: 0, minMarks: 0 })
  })
})

describe('a pattern other than the default', () => {
  // 40 questions in 60 minutes, marked +2 / -0.5. The sample paper is 55-in-45,
  // so under this pattern it should be wrong in exactly the ways it differs.
  const OTHER: Pattern = [
    { code: 'QUANT', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
    { code: 'REASONING', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
    { code: 'ENGLISH', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
    { code: 'PK', questions: 10, minutes: 15, marksCorrect: 2, marksNegative: 0.5 },
  ]

  it('adds up the way it says', () => {
    const t = patternTotals(OTHER)
    expect([t.questions, t.minutes, t.maxMarks, t.minMarks]).toEqual([40, 60, 80, -20])
    expect(patternBands(OTHER).map((b) => [b.from, b.to]))
      .toEqual([[1, 10], [11, 20], [21, 30], [31, 40]])
  })

  it('judges a paper that does not state its own counts', () => {
    // Strip questionCount and the pattern decides; the sample keeps its 55
    // questions, so under a 40-question pattern it is wrong in exactly the
    // ways it differs.
    const silent = mutate((p) => {
      for (const s of p.sections) delete s.questionCount
    })
    const r = ok(silent, { pattern: OTHER })
    expect(r.codes).toContain('SECTION_COUNT')
    expect(r.codes).toContain('TOTAL_COUNT')
    expect(r.publishable).toBe(false)
    // Q15 is fine in QUANT under the default, but QUANT now ends at Q10.
    expect(r.codes).toContain('NUMBER_OUT_OF_BAND')

    // And says how to fix it, since the file is the place to say so.
    expect(r.issues.find((i) => i.code === 'SECTION_COUNT')!.message)
      .toMatch(/Set "questionCount" on this section/)
  })

  it('accepts a paper built to it', () => {
    const built = mutate((p) => {
      let n = 1
      p.sections.forEach((s: any, i: number) => {
        s.questionCount = 10
        s.durationMinutes = 15
        s.marksCorrect = 2
        s.marksNegative = 0.5
        delete s.directions
        s.questions = Array.from({ length: 10 }, () => ({
          ...JSON.parse(JSON.stringify(p.sections[i].questions[0])), number: n++,
        }))
      })
    })
    const r = ok(built, { pattern: OTHER })
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(r.publishable).toBe(true)
    expect(r.paper!.sections.every((s) => s.questionCount === 10)).toBe(true)
  })

  it('still catches a section whose array does not match its own stated count', () => {
    // The safety net: questionCount says 10, the file ships 9.
    const built = mutate((p) => {
      let n = 1
      p.sections.forEach((s: any, i: number) => {
        s.questionCount = 10
        s.durationMinutes = 15
        delete s.directions
        const many = i === 0 ? 9 : 10
        s.questions = Array.from({ length: many }, () => ({
          ...JSON.parse(JSON.stringify(p.sections[i].questions[0])), number: n++,
        }))
      })
    })
    const r = ok(built, { pattern: OTHER })
    expect(r.codes).toContain('SECTION_COUNT')
    expect(r.issues.find((i) => i.code === 'SECTION_COUNT')!.message).toMatch(/its own "questionCount" says 10/)
  })

  it('reads counts from the file even with no pattern supplied', () => {
    // questionCount wins over the default, so a paper is self-describing.
    const built = mutate((p) => {
      p.sections[2].questionCount = 11
      p.sections[2].questions.push({
        ...JSON.parse(JSON.stringify(p.sections[2].questions[0])), number: 41,
      })
      // Everything after English shifts up by one.
      for (const q of p.sections[3].questions) q.number += 1
    })
    const r = ok(built)
    expect(r.codes).not.toContain('SECTION_COUNT')
    expect(r.codes).not.toContain('NUMBER_OUT_OF_BAND')
    expect(r.publishable).toBe(true)
  })
})

describe('the default pattern', () => {
  it('is what the product shipped with: 55 questions in 45 minutes', () => {
    expect(DEFAULT_PATTERN.map((s) => s.code)).toEqual(['QUANT', 'REASONING', 'ENGLISH', 'PK'])
    const t = patternTotals(DEFAULT_PATTERN)
    expect(t.questions).toBe(55)
    expect(t.minutes).toBe(45)
    expect(t.maxMarks).toBe(55)
    expect(t.minMarks).toBe(-13.75)
  })

  it('derives question bands from the counts, with no gaps', () => {
    expect(patternBands(DEFAULT_PATTERN)).toEqual([
      { code: 'QUANT', from: 1, to: 15 },
      { code: 'REASONING', from: 16, to: 30 },
      { code: 'ENGLISH', from: 31, to: 40 },
      { code: 'PK', from: 41, to: 55 },
    ])
  })
})

describe('the paper\'s name', () => {
  it('is optional, and a paper without one is known by its date', () => {
    const r = ok(mutate((p) => { delete p.title }))
    expect(r.codes.filter((c) => c.startsWith('TITLE'))).toEqual([])
    expect(r.paper?.title).toBeUndefined()
  })

  it('refuses one longer than a dashboard card can hold', () => {
    // The same 80 the console's name box enforces: a file and a typed name
    // must not disagree about what fits.
    expect(ok(mutate((p) => { p.title = 'y'.repeat(81) })).codes).toContain('TITLE_LONG')
  })

  it('accepts one exactly at the cap', () => {
    expect(ok(mutate((p) => { p.title = 'y'.repeat(80) })).codes).not.toContain('TITLE_LONG')
  })

  it('agrees with the schema editors validate against', () => {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    expect(validate(JSON.parse(mutate((p) => { p.title = 'y'.repeat(81) })))).toBe(false)
    expect(validate(JSON.parse(mutate((p) => { p.title = 'y'.repeat(80) })))).toBe(true)
  })
})
