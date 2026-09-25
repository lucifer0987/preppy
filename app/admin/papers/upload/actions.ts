'use server'

import { redirect } from 'next/navigation'
import { extractPdfText } from '../../../../lib/extract'
import { readPaper, summarise } from '../../../../lib/paper'
import { savePaper } from '../../../../lib/repo/papers'
import type { Issue } from '../../../../lib/types'
import { currentUser } from '../../../../lib/auth'

import { emptyUpload, type UploadState } from './state'

/** The framework limit in next.config.ts sits above this on purpose, so this
 *  check is what an oversized upload actually hits. */
const MAX_BYTES = 10 * 1024 * 1024

export async function uploadAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') return { ...emptyUpload, fatal: 'Not authorised.' }

  const file = formData.get('paper')
  if (!(file instanceof File) || file.size === 0) {
    return { ...emptyUpload, fatal: 'Choose a file first.' }
  }
  if (file.size > MAX_BYTES) {
    return { ...emptyUpload, fatal: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 10 MB.` }
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf')
  const isJson = file.name.toLowerCase().endsWith('.json')
  if (!isPdf && !isJson) {
    return { ...emptyUpload, fatal: 'Upload a .pdf, or a .json if you have not exported it yet.' }
  }

  let text: string
  const extractIssues: Issue[] = []
  try {
    if (isPdf) {
      const res = await extractPdfText(new Uint8Array(await file.arrayBuffer()))
      text = res.text
      extractIssues.push(...res.issues)
    } else {
      text = await file.text()
    }
  } catch (e) {
    return { ...emptyUpload, fileName: file.name, fatal: `Could not read the file: ${(e as Error).message}` }
  }

  const { paper, issues, repairs } = readPaper(text)
  const all = [...extractIssues, ...issues]
  const { publishable } = summarise(all)

  if (!publishable || !paper) {
    return { issues: all, repairs, fileName: file.name, fatal: null }
  }

  // Saved as a DRAFT. It reaches SCHEDULED only by an explicit second action
  // taken after the preview screen (FR-6.9.1).
  let saved
  try {
    saved = await savePaper(paper, null)
  } catch (e) {
    return { issues: all, repairs, fileName: file.name, fatal: (e as Error).message }
  }

  redirect(`/admin/papers/${saved.id}?new=1${saved.replacedDraft ? '&replaced=1' : ''}`)
}
