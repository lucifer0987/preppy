'use server'

import { redirect } from 'next/navigation'
import { signIn, signOut } from '../../lib/auth'

export type LoginState = { error: string | null }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')

  const result = await signIn(username, password)
  if (!result.ok) return { error: result.message }

  redirect('/dashboard')
}

export async function logoutAction() {
  await signOut()
  redirect('/')
}
