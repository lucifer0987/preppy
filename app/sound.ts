'use server'

import { actionUser } from '../lib/guard'
import { db } from '../lib/supabase/admin'

/** Saves the person's sound setting (PRD 8.3: remembered per user). */
export async function setSoundAction(on: boolean): Promise<void> {
  const user = await actionUser()
  // Thrown, not ignored, so the switch flips back rather than showing a
  // setting that was never saved.
  if (!user) throw new Error('Not signed in.')
  const { error } = await db().from('profiles').update({ sound_enabled: on === true }).eq('id', user.id)
  if (error) throw new Error(`Could not save the sound setting: ${error.message}`)
}
