import { createClient } from '@supabase/supabase-js'
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const username = 'zzshot'
const { data: existing } = await c.from('profiles').select('id').eq('username', username).maybeSingle()
if (existing) { await c.auth.admin.deleteUser(existing.id as string); await c.from('profiles').delete().eq('id', existing.id as string) }
const { data, error } = await c.auth.admin.createUser({ email: `${username}@preppy.local`, password: 'ZzShot!2026pw', email_confirm: true })
if (error || !data.user) throw new Error(error?.message)
await c.from('profiles').insert({ id: data.user.id, username, display_name: 'Screenshot Admin', role: 'admin', must_change_password: false })
console.log(data.user.id)
