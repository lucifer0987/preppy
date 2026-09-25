import { PATTERN, type Paper, type PaperQuestion, type SectionCode } from './types'

/**
 * Pure translation between the JSON paper format and database rows.
 *
 * Kept free of IO so it can be tested without a database: the round trip
 * paper -> rows -> paper must be the identity, which is the property that
 * actually matters when a paper is written once and read back every night for
 * months.
 *
 * Primary keys are assigned by Postgres, so rows here are linked by section
 * code and question number. The repository resolves those to UUIDs on insert.
 */

export interface TestRow {
  date: string
  title: string | null
  status: 'DRAFT' | 'SCHEDULED'
  source_pdf_path: string | null
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
  /**
   * Index into the section's direction blocks, or null.
   *
   * Write-side only: savePaper uses it to set the foreign key. rowsToPaper
   * re-derives the association from the block's own from/to range, so a paper
   * read back from the database does not need it populated.
   */
  directionIndex: number | null
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

export function paperToRows(paper: Paper, sourcePdfPath: string | null = null): PaperRows {
  const sections: SectionRow[] = []
  const directionBlocks: DirectionBlockRow[] = []
  const questions: QuestionRow[] = []

  paper.sections.forEach((section, index) => {
    const pattern = PATTERN[section.code]
    sections.push({
      code: section.code,
      position: index + 1,
      duration_sec: Math.round((section.durationMinutes ?? pattern.minutes) * 60),
      marks_correct: section.marksCorrect ?? 1,
      marks_negative: section.marksNegative ?? 0.25,
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
      const directionIndex = blocks.findIndex((b) => q.number >= b.from && q.number <= b.to)
      questions.push({
        sectionCode: section.code,
        directionIndex: directionIndex === -1 ? null : directionIndex,
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
      source_pdf_path: sourcePdfPath,
    },
    sections,
    directionBlocks,
    questions,
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
