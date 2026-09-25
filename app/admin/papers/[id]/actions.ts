'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { currentUser } from '../../../../lib/auth'
import { deletePaper, schedulePaper, unschedulePaper } from '../../../../lib/repo/papers'

async function requireAdmin() {
  const admin = await currentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Not authorised.')
  return admin
}

export async function scheduleAction(formData: FormData) {
  const admin = await requireAdmin()
  await schedulePaper(String(formData.get('id')), admin.id)
  revalidatePath('/admin')
  redirect(`/admin/papers/${formData.get('id')}?scheduled=1`)
}

export async function unscheduleAction(formData: FormData) {
  await requireAdmin()
  await unschedulePaper(String(formData.get('id')))
  revalidatePath('/admin')
  redirect(`/admin/papers/${formData.get('id')}`)
}

export async function deleteAction(formData: FormData) {
  await requireAdmin()
  await deletePaper(String(formData.get('id')))
  revalidatePath('/admin')
  redirect('/admin/papers')
}
