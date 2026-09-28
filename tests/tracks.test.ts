import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readPaper, summarise } from '../lib/paper'
import { buildTemplate, templateQuestionCount } from '../lib/template'
import {
  DEFAULT_PATTERN, patternBands, patternTotals, sectionName, type Pattern,
} from '../lib/types'

/**
 * A track owns which sections a paper has, in what order (PRD 6.10).
 *
 * Everything the validator and the template used to read off a constant now
 * comes from a pattern, so these are the cases that constant made impossible:
 * a paper with a section the exam does not have, a paper missing one it does,
 * and an exam whose sections are not the four this product shipped with.
 */

const sample = readFileSync('format/sample.json', 'utf8')

/** An exam with no Quant, a section the old constant did not know, and its own names. */
const AGRICULTURE: Pattern = [
  { code: 'REASONING', questions: 20, minutes: 15, marksCorrect: 1, marksNegative: 0.25 },
  { code: 'ENGLISH', questions: 10, minutes: 8, marksCorrect: 1, marksNegative: 0.25 },
  { code: 'GENERAL_AWARENESS', questions: 15, minutes: 10, marksCorrect: 1, marksNegative: 0.25 },
  {
    code: 'PK', questions: 15, minutes: 12, marksCorrect: 2, marksNegative: 0.5,
    label: 'Professional Knowledge (Agriculture)',
  },
]

describe('what a section is called', () => {
  it('is the track’s own label when it has one', () => {
    expect(sectionName(AGRICULTURE, 'PK')).toBe('Professional Knowledge (Agriculture)')
  })

  it('falls back to the built-in name, which no longer names a discipline', () => {
    expect(sectionName(DEFAULT_PATTERN, 'PK')).toBe('Professional Knowledge')
    expect(sectionName(AGRICULTURE, 'REASONING')).toBe('Reasoning Ability')
  })

  it('names a section the pattern does not even have, rather than printing nothing', () => {
    expect(sectionName(AGRICULTURE, 'QUANT')).toBe('Quantitative Aptitude')
  })
})

describe('a pattern of any shape', () => {
  it('numbers its questions continuously, whatever the sections are', () => {
    expect(patternBands(AGRICULTURE)).toEqual([
      { code: 'REASONING', from: 1, to: 20 },
      { code: 'ENGLISH', from: 21, to: 30 },
      { code: 'GENERAL_AWARENESS', from: 31, to: 45 },
      { code: 'PK', from: 46, to: 60 },
    ])
  })

  it('totals marking that differs section to section', () => {
    const t = patternTotals(AGRICULTURE)
    expect(t.questions).toBe(60)
    expect(t.minutes).toBe(45)
    // 45 at one mark, 15 at two.
    expect(t.maxMarks).toBe(75)
    expect(t.minMarks).toBe(-18.75)
  })
})

describe('a paper is checked against its own exam', () => {
  const read = (text: string, pattern: Pattern) => {
    const r = readPaper(text, { pattern })
    return { ...summarise(r.issues), codes: r.issues.map((i) => i.code) }
  }

  it('accepts the shipped paper on the exam it was written for', () => {
    expect(read(sample, DEFAULT_PATTERN).publishable).toBe(true)
  })

  it('refuses it on an exam with different sections', () => {
    // sample.json opens with Quant, which this exam does not have at all.
    const r = read(sample, AGRICULTURE)
    expect(r.publishable).toBe(false)
    expect(r.codes).toContain('SECTION_NOT_IN_PATTERN')
  })

  it('says which sections the exam does have, rather than "unknown section"', () => {
    const { issues } = readPaper(sample, { pattern: AGRICULTURE })
    const said = issues.find((i) => i.code === 'SECTION_NOT_IN_PATTERN')!
    expect(said.message).toMatch(/no QUANT section/)
    expect(said.message).toMatch(/REASONING, ENGLISH, GENERAL_AWARENESS, PK/)
  })

  it('accepts a paper built to that exam, sections, order, marking and all', () => {
    const paper = buildTemplate(AGRICULTURE)
    // The template ships placeholders on purpose, so fill them in as an
    // upload would before checking that the shape itself passes.
    const real = JSON.parse(JSON.stringify(paper)) as Record<string, unknown>
    real['title'] = 'Agriculture 001'
    real['date'] = '2027-05-20'
    for (const s of real['sections'] as Record<string, unknown>[]) {
      for (const q of s['questions'] as Record<string, unknown>[]) {
        q['text'] = `A real question numbered ${q['number']}, long enough to pass.`
        q['options'] = { A: 'First', B: 'Second', C: 'Third', D: 'Fourth' }
        q['answer'] = 'B'
        q['solution'] = 'Because the second one is right.'
        q['tag'] = 'Crop-Science'
      }
      delete s['directions']
    }
    // Warnings are fine here; nothing about the shape may be an error. Four
    // options is not one of either -- it is the floor, and legal.
    const { issues } = readPaper(JSON.stringify(real), { pattern: AGRICULTURE })
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(read(JSON.stringify(real), AGRICULTURE).publishable).toBe(true)
  })

  it('builds a template with exactly the questions that exam asks for', () => {
    expect(templateQuestionCount(buildTemplate(AGRICULTURE))).toBe(60)
    expect(templateQuestionCount(buildTemplate(DEFAULT_PATTERN))).toBe(55)
  })

  it('refuses a section the exam has, left out of the file', () => {
    const doc = JSON.parse(sample) as { sections: { code: string }[] }
    doc.sections = doc.sections.filter((s) => s.code !== 'ENGLISH')
    const r = read(JSON.stringify(doc), DEFAULT_PATTERN)
    expect(r.codes).toContain('SECTION_MISSING')
    expect(r.publishable).toBe(false)
  })

  it('refuses the exam’s own sections in the wrong order', () => {
    const doc = JSON.parse(sample) as { sections: { code: string }[] }
    ;[doc.sections[0], doc.sections[1]] = [doc.sections[1]!, doc.sections[0]!]
    expect(read(JSON.stringify(doc), DEFAULT_PATTERN).codes).toContain('SECTION_ORDER')
  })
})
