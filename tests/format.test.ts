import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import { FIELDS, readPaper, readQuestion, summarise } from '../lib/paper'
import { PATTERN, SECTION_CODES } from '../lib/types'

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
      ['sections out of order', (p) => { p.sections.reverse() }],
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

  it('keeps the DI table as structured data, not aligned text', () => {
    const p = ok(sampleJson).paper!
    const table = p.sections[0]!.directions![0]!.table!
    expect(table.headers).toEqual(['Year', 'Java', 'Python', 'DBMS', 'Networking'])
    expect(table.rows).toHaveLength(3)
    expect(table.rows.every((r) => r.length === table.headers.length)).toBe(true)
  })

  it('numbers every question inside its section band', () => {
    const p = ok(sampleJson).paper!
    for (const s of p.sections) {
      const band = PATTERN[s.code]
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

  it('rejects sections that add up to more than the 45-minute window', () => {
    const r = ok(mutate((p) => { p.sections[3].durationMinutes = 20 }))
    expect(r.codes).toContain('DURATION_TOTAL')
    // Shorter is fine: nobody is cut short by the hard stop.
    expect(ok(mutate((p) => { p.sections[3].durationMinutes = 10 })).codes).not.toContain('DURATION_TOTAL')
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
    expect(codes(q(), 'PK')).toContain('NUMBER_OUT_OF_BAND')
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

describe('the pattern itself', () => {
  it('adds up to 55 questions and 45 minutes', () => {
    expect(Object.keys(PATTERN).sort()).toEqual([...SECTION_CODES].sort())
    expect(Object.values(PATTERN).reduce((a, s) => a + s.questions, 0)).toBe(55)
    expect(Object.values(PATTERN).reduce((a, s) => a + s.minutes, 0)).toBe(45)
  })
})
