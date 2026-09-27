'use server'

import { redirect } from 'next/navigation'
import { readPaper, summarise } from '../../../../lib/paper'
import { paperLock, replacePaperContent, savePaper, scheduledDates } from '../../../../lib/repo/papers'
import { deletePaperImages, savePaperImages, type ImageUpload } from '../../../../lib/repo/images'
import { IMAGE_NAME_PATTERN, MAX_IMAGE_BYTES, imageType } from '../../../../lib/images'
import { formatIstDate, istDate } from '../../../../lib/time'
import { actionAdmin } from '../../../../lib/guard'
import { LIMITS } from '../../../../lib/rate-limit'
import { hit } from '../../../../lib/repo/rate-limit'

import { emptyUpload, type UploadState } from './state'

/** The framework limit in next.config.ts sits above this on purpose, so this
 *  check is what an oversized upload actually hits. It covers the paper and
 *  its images together, since they arrive in one request. */
const MAX_BYTES = 10 * 1024 * 1024

/** Browsers disagree on what a .json file is: some send nothing, some text/plain. */
const ACCEPTED_TYPES = ['application/json', 'text/json', 'text/plain', '']

export async function uploadAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const admin = await actionAdmin()
  if (!admin) return { ...emptyUpload, fatal: 'Not authorised.' }
  // PRD 13: uploads are rate limited as well as size- and type-checked.
  const wait = await hit(`upload:${admin.id}`, LIMITS.upload)
  if (wait > 0) {
    return { ...emptyUpload, fatal: `That is a lot of uploads in a short time. Try again in ${Math.ceil(wait / 60)} minute(s).` }
  }

  // Set when this upload is a corrected version of a paper that already
  // exists, rather than a new one. The paper keeps its id, its night and its
  // place in the schedule; only what is inside it changes.
  const replaceId = String(formData.get('replaceId') ?? '') || null

  // What the admin typed in the name box, if anything. The file's own title is
  // the default -- most papers are numbered in the file and never need this --
  // but a file called "Daily Mock 002" twice over is a real thing that
  // happens, and renaming it afterwards meant nothing at the moment it
  // mattered.
  const chosenTitle = String(formData.get('title') ?? '').trim().replace(/\s+/g, ' ')
  if (chosenTitle.length > 80) {
    return { ...emptyUpload, fatal: 'Keep the name under 80 characters.' }
  }

  const file = formData.get('paper')
  if (!(file instanceof File) || file.size === 0) {
    return { ...emptyUpload, fatal: 'Choose a file first.' }
  }
  if (file.size > MAX_BYTES) {
    return { ...emptyUpload, fatal: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is 10 MB.` }
  }

  if (!file.name.toLowerCase().endsWith('.json')) {
    return { ...emptyUpload, fatal: 'Upload the paper as a .json file.' }
  }
  // PRD section 13: uploads are restricted by MIME type as well as name.
  const type = file.type.split(';')[0]!.trim().toLowerCase()
  if (!ACCEPTED_TYPES.includes(type)) {
    return { ...emptyUpload, fileName: file.name, fatal: `That file is ${file.type}, not JSON. Upload the paper as a .json file.` }
  }

  // Images travel with the paper (FR-6.9.1). Each is checked by name, type
  // and size; the validator then confirms every reference has a file.
  const images: ImageUpload[] = []
  let total = file.size
  for (const img of formData.getAll('images')) {
    if (!(img instanceof File) || img.size === 0) continue
    const type = imageType(img.name)
    if (!IMAGE_NAME_PATTERN.test(img.name) || !type) {
      return { ...emptyUpload, fileName: file.name, fatal: `"${img.name}" is not a usable image. Use a plain file name ending in .png, .jpg, .webp or .gif.` }
    }
    if (img.type && img.type !== type) {
      return { ...emptyUpload, fileName: file.name, fatal: `"${img.name}" is ${img.type}, which does not match its extension.` }
    }
    if (img.size > MAX_IMAGE_BYTES) {
      return { ...emptyUpload, fileName: file.name, fatal: `"${img.name}" is ${(img.size / 1e6).toFixed(1)} MB. Each image must be under 2 MB.` }
    }
    total += img.size
    images.push({ name: img.name, type, bytes: await img.arrayBuffer() })
  }
  if (total > MAX_BYTES) {
    return { ...emptyUpload, fileName: file.name, fatal: `The paper and its images come to ${(total / 1e6).toFixed(1)} MB. The limit is 10 MB.` }
  }

  let text: string
  try {
    text = await file.text()
  } catch (e) {
    return { ...emptyUpload, fileName: file.name, fatal: `Could not read the file: ${(e as Error).message}` }
  }

  let takenDates: string[]
  try {
    takenDates = await scheduledDates(replaceId ?? undefined)
  } catch (e) {
    return { ...emptyUpload, fileName: file.name, fatal: (e as Error).message }
  }

  const { paper: read, issues } = readPaper(text, { takenDates, today: istDate(), availableImages: images.map((i) => i.name) })
  const { publishable } = summarise(issues)

  if (!publishable || !read) {
    return { issues, fileName: file.name, fatal: null }
  }
  // Applied after validation, so a typed name cannot make an invalid paper
  // look valid, and the checker still reports on the file as written.
  const paper = chosenTitle ? { ...read, title: chosenTitle } : read

  if (replaceId) {
    const lock = await paperLock(replaceId)
    if (!lock) return { issues, fileName: file.name, fatal: 'That paper no longer exists.' }
    // A file for a different night is almost always the wrong file. The
    // replacement keeps the paper's own night, so saying so beats silently
    // moving the questions to a date they were not written for.
    if (paper.date !== lock.date) {
      return {
        issues, fileName: file.name,
        fatal: `This file is dated ${formatIstDate(paper.date)}, but the paper it would replace runs on `
          + `${formatIstDate(lock.date)}. Fix the date in the file, or upload it as a new paper.`,
      }
    }
    try {
      await replacePaperContent(replaceId, paper)
    } catch (e) {
      return { issues, fileName: file.name, fatal: (e as Error).message }
    }
    // The old images go only once the new questions are in: a failure above
    // leaves the paper exactly as it was, pictures included.
    await deletePaperImages(replaceId)
    try {
      await savePaperImages(replaceId, images)
    } catch (e) {
      return {
        issues, fileName: file.name,
        fatal: `The questions were replaced, but their images were not: ${(e as Error).message} Upload it again.`,
      }
    }
    redirect(`/admin/papers/${replaceId}?replaced=1`)
  }

  // Saved as a DRAFT. It reaches SCHEDULED only by an explicit second action
  // taken after the preview screen (FR-6.9.1).
  let saved
  try {
    saved = await savePaper(paper)
  } catch (e) {
    return { issues, fileName: file.name, fatal: (e as Error).message }
  }

  try {
    await savePaperImages(saved.id, images)
  } catch (e) {
    return {
      issues, fileName: file.name,
      fatal: `The paper was saved as a draft, but its images were not: ${(e as Error).message} Upload it again to replace the draft.`,
    }
  }
  if (saved.replacedId) await deletePaperImages(saved.replacedId)

  redirect(`/admin/papers/${saved.id}?new=1${saved.replacedDraft ? '&replaced=1' : ''}`)
}
