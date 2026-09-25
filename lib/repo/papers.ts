import 'server-only'
import { db } from '../supabase/admin'
import { paperToRows, rowsToPaper, type PaperRows } from '../paper-rows'
import type { Paper, SectionCode } from '../types'

/**
 * Reading and writing papers.
 *
 * Supabase exposes no client-side transaction, so savePaper inserts the parent
 * row first and deletes it if any child insert fails. The foreign keys cascade,
 * so that compensating delete leaves nothing behind. A half-written paper would
 * be far worse than a failed upload: it would go live at 10 PM with questions
 * missing.
 */

export interface PaperSummary {
  id: string
  date: string
  title: string | null
  status: 'DRAFT' | 'SCHEDULED'
  questionCount: number
}

export interface SaveResult {
  id: string
  /** True when an existing draft for the same date was replaced. */
  replacedDraft: boolean
}

export async function savePaper(paper: Paper, sourcePdfPath: string | null = null): Promise<SaveResult> {
  const rows = paperToRows(paper, sourcePdfPath)
  const client = db()

  // A draft is by definition not committed to, so re-uploading a corrected
  // version replaces it. A scheduled paper is refused: someone may already be
  // relying on it going live tonight.
  let replacedDraft = false
  const { data: existing } = await client
    .from('tests').select('id, status').eq('date', paper.date).maybeSingle()
  if (existing) {
    if (existing.status !== 'DRAFT') {
      throw new Error(
        `A paper is already scheduled for ${paper.date}. Move it back to draft first, or pick another date.`,
      )
    }
    await client.from('tests').delete().eq('id', existing.id)
    replacedDraft = true
  }

  const { data: test, error: testError } = await client
    .from('tests')
    .insert(rows.test)
    .select('id')
    .single()

  if (testError || !test) {
    if (testError?.code === '23505') {
      throw new Error(`A paper already exists for ${paper.date}. Pick another date.`)
    }
    throw new Error(`Could not create the paper: ${testError?.message ?? 'unknown error'}`)
  }

  try {
    const { data: sections, error: sectionError } = await client
      .from('sections')
      .insert(rows.sections.map((s) => ({ ...s, test_id: test.id })))
      .select('id, code')
    if (sectionError || !sections) throw new Error(sectionError?.message ?? 'sections failed')

    const sectionId = new Map(sections.map((s) => [s.code as SectionCode, s.id as string]))

    // Direction blocks first, so questions can point at them.
    const blockIdByKey = new Map<string, string>()
    if (rows.directionBlocks.length) {
      const { data: blocks, error: blockError } = await client
        .from('direction_blocks')
        .insert(rows.directionBlocks.map((b) => ({
          section_id: sectionId.get(b.sectionCode),
          q_from: b.q_from,
          q_to: b.q_to,
          content: b.content,
          table_data: b.table_data,
          image_paths: b.image_paths,
        })))
        .select('id, section_id, q_from')
      if (blockError || !blocks) throw new Error(blockError?.message ?? 'direction blocks failed')
      for (const b of blocks) blockIdByKey.set(`${b.section_id}:${b.q_from}`, b.id as string)
    }

    const { error: questionError } = await client.from('questions').insert(
      rows.questions.map((q) => {
        const sid = sectionId.get(q.sectionCode)
        const block = q.directionIndex === null
          ? null
          : rows.directionBlocks.filter((b) => b.sectionCode === q.sectionCode)[q.directionIndex]
        return {
          section_id: sid,
          direction_block_id: block ? blockIdByKey.get(`${sid}:${block.q_from}`) ?? null : null,
          number: q.number,
          text: q.text,
          options: q.options,
          correct_option: q.correct_option,
          solution: q.solution,
          tag: q.tag,
          difficulty: q.difficulty,
          image_paths: q.image_paths,
        }
      }),
    )
    if (questionError) throw new Error(questionError.message)

    return { id: test.id as string, replacedDraft }
  } catch (e) {
    // Undo the parent row; the cascade removes whatever children got in.
    await client.from('tests').delete().eq('id', test.id)
    throw new Error(`Could not save the paper, so nothing was kept: ${(e as Error).message}`)
  }
}

export async function getPaperByDate(date: string): Promise<{ id: string; status: string; paper: Paper } | null> {
  const { data: test } = await db()
    .from('tests')
    .select('id, date, title, status, source_pdf_path')
    .eq('date', date)
    .maybeSingle()
  if (!test) return null
  return { id: test.id, status: test.status, paper: await loadPaper(test) }
}

export async function getPaperById(id: string): Promise<{ id: string; status: string; paper: Paper } | null> {
  const { data: test } = await db()
    .from('tests')
    .select('id, date, title, status, source_pdf_path')
    .eq('id', id)
    .maybeSingle()
  if (!test) return null
  return { id: test.id, status: test.status, paper: await loadPaper(test) }
}

async function loadPaper(test: Record<string, unknown>): Promise<Paper> {
  const client = db()
  const testId = test['id'] as string

  const { data: sections } = await client
    .from('sections')
    .select('id, code, position, duration_sec, marks_correct, marks_negative, question_count')
    .eq('test_id', testId)
    .order('position')

  const sectionIds = (sections ?? []).map((s) => s.id as string)
  const { data: blocks } = await client
    .from('direction_blocks')
    .select('section_id, q_from, q_to, content, table_data, image_paths')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('q_from')

  const { data: questions } = await client
    .from('questions')
    .select('section_id, number, text, options, correct_option, solution, tag, difficulty, image_paths')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('number')

  const codeById = new Map((sections ?? []).map((s) => [s.id as string, s.code as SectionCode]))

  const rows: PaperRows = {
    test: {
      date: test['date'] as string,
      title: (test['title'] as string | null) ?? null,
      status: test['status'] as 'DRAFT' | 'SCHEDULED',
      source_pdf_path: (test['source_pdf_path'] as string | null) ?? null,
    },
    sections: (sections ?? []).map((s) => ({
      code: s.code as SectionCode,
      position: s.position as number,
      duration_sec: s.duration_sec as number,
      marks_correct: Number(s.marks_correct),
      marks_negative: Number(s.marks_negative),
      question_count: s.question_count as number,
    })),
    directionBlocks: (blocks ?? []).map((b) => ({
      sectionCode: codeById.get(b.section_id as string)!,
      q_from: b.q_from as number,
      q_to: b.q_to as number,
      content: b.content as string,
      table_data: b.table_data,
      image_paths: (b.image_paths as string[]) ?? [],
    })),
    questions: (questions ?? []).map((q) => ({
      sectionCode: codeById.get(q.section_id as string)!,
      directionIndex: null, // recomputed from ranges by rowsToPaper's consumers
      number: q.number as number,
      text: q.text as string,
      options: q.options as Record<string, string>,
      correct_option: q.correct_option as string,
      solution: (q.solution as string | null) ?? null,
      tag: (q.tag as string | null) ?? null,
      difficulty: (q.difficulty as string | null) ?? null,
      image_paths: (q.image_paths as string[]) ?? [],
    })),
  }

  return rowsToPaper(rows)
}

export async function listPapers(): Promise<PaperSummary[]> {
  const { data } = await db()
    .from('tests')
    .select('id, date, title, status, sections(question_count)')
    .order('date', { ascending: false })

  return (data ?? []).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    title: (t.title as string | null) ?? null,
    status: t.status as 'DRAFT' | 'SCHEDULED',
    questionCount: ((t.sections ?? []) as { question_count: number }[])
      .reduce((a, s) => a + s.question_count, 0),
  }))
}

/** FR-6.9.1: a paper only ever becomes schedulable by an explicit admin action. */
export async function schedulePaper(id: string, adminId: string): Promise<void> {
  const { error } = await db()
    .from('tests')
    .update({ status: 'SCHEDULED', published_by: adminId, published_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Could not schedule the paper: ${error.message}`)
}

export async function unschedulePaper(id: string): Promise<void> {
  const { error } = await db()
    .from('tests')
    .update({ status: 'DRAFT', published_by: null, published_at: null })
    .eq('id', id)
  if (error) throw new Error(`Could not move the paper back to draft: ${error.message}`)
}

export async function deletePaper(id: string): Promise<void> {
  const { error } = await db().from('tests').delete().eq('id', id)
  if (error) throw new Error(`Could not delete the paper: ${error.message}`)
}
