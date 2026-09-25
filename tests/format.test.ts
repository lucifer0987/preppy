import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import Ajv from 'ajv/dist/2020.js'
import { readPaper, summarise } from '../lib/paper.js'
import { repairJson } from '../lib/json-repair.js'
import { PATTERN, SECTION_CODES } from '../lib/types.js'

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

  it('template.json is publishable, so a filled-in copy starts valid', () => {
    const r = ok(templateJson)
    expect(r.errors, r.errors.map((e) => `${e.path}: ${e.message}`).join('\n')).toHaveLength(0)
  })

  it('both agree with schema.json', () => {
    const ajv = new (Ajv as any)({ allErrors: true, strict: false })
    const validate = ajv.compile(schema)
    for (const src of [sampleJson, templateJson]) {
      expect(validate(JSON.parse(src)), JSON.stringify(validate.errors)).toBe(true)
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

describe('repairing what a PDF does to JSON', () => {
  it('straightens curly quotes', () => {
    const r = repairJson('{“format”: “preppy-paper”}')
    expect(JSON.parse(r.json)).toEqual({ format: 'preppy-paper' })
    expect(r.repairs.find((x) => x.kind === 'curly-double-quotes')?.count).toBe(4)
  })

  it('rejoins a string split across lines', () => {
    const r = repairJson('{"text": "first half\n  second half"}')
    expect(JSON.parse(r.json).text).toBe('first half second half')
    expect(r.repairs.find((x) => x.kind === 'wrapped-strings')?.count).toBe(1)
  })

  it('drops page headers and footers', () => {
    const r = repairJson('Daily Mock 001   page 1\n{"a": 1}\npage 1 of 3')
    expect(JSON.parse(r.json)).toEqual({ a: 1 })
    expect(r.repairs.some((x) => x.kind === 'page-furniture')).toBe(true)
  })

  it('converts a Unicode minus back to a hyphen', () => {
    const r = repairJson('{"marksNegative": −0.25}')
    expect(JSON.parse(r.json).marksNegative).toBe(-0.25)
  })

  it('removes trailing commas', () => {
    const r = repairJson('{"a": 1, "b": [1, 2,],}')
    expect(JSON.parse(r.json)).toEqual({ a: 1, b: [1, 2] })
  })

  it('leaves an escaped quote inside a string alone', () => {
    const r = repairJson('{"text": "she said \\"go\\" loudly"}')
    expect(JSON.parse(r.json).text).toBe('she said "go" loudly')
  })

  it('handles every damage type at once', () => {
    const damaged = [
      'Preppy Daily Mock    page 1',
      '{',
      '  “format”: “preppy-paper”,',
      '  “n”: −0.25,',
      '  “text”: “A train 150 m long',
      'crosses a pole.”,',
      '}',
    ].join('\n')
    const r = repairJson(damaged)
    expect(JSON.parse(r.json)).toEqual({ format: 'preppy-paper', n: -0.25, text: 'A train 150 m long crosses a pole.' })
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

  it('rejects a date that already has a paper', () => {
    expect(ok(sampleJson, { takenDates: ['2026-09-26'] }).codes).toContain('DATE_TAKEN')
  })

  it('rejects a missing answer', () => {
    expect(ok(mutate((p) => { delete p.sections[0].questions[0].answer })).codes).toContain('ANSWER_MISSING')
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

  it('rejects an image that was not uploaded', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].images = ['figure.png'] })).codes).toContain('IMAGE_MISSING')
  })

  it('accepts an image that was uploaded', () => {
    const r = ok(mutate((p) => { p.sections[0].questions[0].images = ['figure.png'] }), { availableImages: ['figure.png'] })
    expect(r.codes).not.toContain('IMAGE_MISSING')
    expect(r.publishable).toBe(true)
  })

  it('rejects an invalid difficulty', () => {
    expect(ok(mutate((p) => { p.sections[0].questions[0].difficulty = 'Tricky' })).codes).toContain('DIFFICULTY_INVALID')
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
