import { DEFAULT_PATTERN, patternOf, type Paper, type Pattern, type PaperQuestion, type SectionCode } from './types'

/**
 * Pure translation between the JSON paper format and database rows.
 *
 * Kept free of IO so it can be tested without a database: the round trip
 * paper -> rows -> paper must be the identity, which is the property that
 * actually matters when a paper is written once and read back every night for
 * months.
 *
 * Primary keys are assigned by Postgres, so rows here are linked by section
 * code and question number. save_paper (supabase/migrations) resolves those to
 * ids inside one transaction, and links each question to the directions block
 * whose range holds it.
 */

export interface TestRow {
  date: string
  title: string | null
  status: 'DRAFT' | 'SCHEDULED'
}

export interface SectionRow {
  code: SectionCode
  position: number
  duration_sec: number
  marks_correct: number
  marks_negative: number
  question_count: number
}

export interface DirectionBlockRow {
  sectionCode: SectionCode
  q_from: number
  q_to: number
  content: string
  table_data: unknown | null
  image_paths: string[]
}

export interface QuestionRow {
  sectionCode: SectionCode
  number: number
  text: string
  options: Record<string, string>
  correct_option: string
  solution: string | null
  tag: string | null
  difficulty: string | null
  image_paths: string[]
}

export interface PaperRows {
  test: TestRow
  sections: SectionRow[]
  directionBlocks: DirectionBlockRow[]
  questions: QuestionRow[]
}

/**
 * @param pattern What a section falls back to when the file omits its minutes
 *                or marking. The paper itself always wins; this only fills
 *                gaps, so a file that states everything ignores it entirely.
 */
export function paperToRows(paper: Paper, pattern: Pattern = DEFAULT_PATTERN): PaperRows {
  const sections: SectionRow[] = []
  const directionBlocks: DirectionBlockRow[] = []
  const questions: QuestionRow[] = []

  paper.sections.forEach((section, index) => {
    const fallback = patternOf(pattern, section.code)
    sections.push({
      code: section.code,
      position: index + 1,
      duration_sec: Math.round((section.durationMinutes ?? fallback?.minutes ?? 0) * 60),
      marks_correct: section.marksCorrect ?? fallback?.marksCorrect ?? 1,
      marks_negative: section.marksNegative ?? fallback?.marksNegative ?? 0.25,
      question_count: section.questions.length,
    })

    const blocks = section.directions ?? []
    blocks.forEach((block) => {
      directionBlocks.push({
        sectionCode: section.code,
        q_from: block.from,
        q_to: block.to,
        content: block.text,
        table_data: block.table ?? null,
        image_paths: block.images ?? [],
      })
    })

    for (const q of section.questions) {
      questions.push({
        sectionCode: section.code,
        number: q.number,
        text: q.text,
        options: q.options as Record<string, string>,
        correct_option: q.answer,
        solution: q.solution ?? null,
        tag: q.tag ?? null,
        difficulty: q.difficulty ?? null,
        image_paths: q.images ?? [],
      })
    }
  })

  return {
    test: {
      date: paper.date,
      title: paper.title ?? null,
      status: 'DRAFT',
    },
    sections,
    directionBlocks,
    questions,
  }
}

/**
 * The argument to save_paper: each section with its own blocks and questions
 * nested inside it, so the function needs no join keys from the client.
 */
export function savePaperPayload(rows: PaperRows): Record<string, unknown> {
  return {
    date: rows.test.date,
    title: rows.test.title,
    sections: rows.sections.map((s) => ({
      ...s,
      blocks: rows.directionBlocks
        .filter((b) => b.sectionCode === s.code)
        .map(({ sectionCode: _c, ...b }) => b),
      questions: rows.questions
        .filter((q) => q.sectionCode === s.code)
        .map(({ sectionCode: _c, ...q }) => q),
    })),
  }
}

/** The inverse, used by the preview screen and the archive. */
export function rowsToPaper(rows: PaperRows): Paper {
  return {
    format: 'preppy-paper',
    version: 1,
    date: rows.test.date,
    ...(rows.test.title ? { title: rows.test.title } : {}),
    sections: [...rows.sections]
      .sort((a, b) => a.position - b.position)
      .map((section) => {
        const blocks = rows.directionBlocks.filter((b) => b.sectionCode === section.code)
        const questions: PaperQuestion[] = rows.questions
          .filter((q) => q.sectionCode === section.code)
          .sort((a, b) => a.number - b.number)
          .map((q) => ({
            number: q.number,
            text: q.text,
            options: q.options as PaperQuestion['options'],
            answer: q.correct_option as PaperQuestion['answer'],
            ...(q.solution ? { solution: q.solution } : {}),
            ...(q.tag ? { tag: q.tag } : {}),
            ...(q.difficulty ? { difficulty: q.difficulty as PaperQuestion['difficulty'] } : {}),
            ...(q.image_paths.length ? { images: q.image_paths } : {}),
          }))

        return {
          code: section.code,
          durationMinutes: section.duration_sec / 60,
          marksCorrect: section.marks_correct,
          marksNegative: section.marks_negative,
          ...(blocks.length
            ? {
                directions: blocks.map((b) => ({
                  from: b.q_from,
                  to: b.q_to,
                  text: b.content,
                  ...(b.table_data ? { table: b.table_data as never } : {}),
                  ...(b.image_paths.length ? { images: b.image_paths } : {}),
                })),
              }
            : {}),
          questions,
        }
      }),
  }
}
