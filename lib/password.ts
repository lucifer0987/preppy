import { randomInt } from 'node:crypto'

/**
 * Generated passwords, and reading the session a token belongs to.
 *
 * Free of any server-only import, because supabase/seed.ts runs under plain
 * tsx and needs the same generator as the app.
 */

/**
 * Crockford's base32 alphabet, lowercased: digits and letters minus i, l, o
 * and u, so nothing read aloud or copied off a screen can be mistaken for
 * something else.
 */
export const PASSWORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const GROUPS = 3
const GROUP_LENGTH = 4

/** 12 symbols from 32 = 60 bits, well past what an online guesser can reach. */
export const PASSWORD_BITS = GROUPS * GROUP_LENGTH * Math.log2(PASSWORD_ALPHABET.length)

/**
 * A handed-out password such as "k7qm-3xtr-9hwp". Three groups of four read
 * aloud easily and type easily on a phone. randomInt draws uniformly, so there
 * is no modulo bias.
 */
export function generatePassword(): string {
  const groups: string[] = []
  for (let g = 0; g < GROUPS; g++) {
    let group = ''
    for (let i = 0; i < GROUP_LENGTH; i++) group += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
    groups.push(group)
  }
  return groups.join('-')
}

/**
 * The Supabase session an access token belongs to, from its `session_id`
 * claim. Used to keep the caller's own session when revoking the rest
 * (revoke_user_sessions in supabase/schema.sql). The token has already been
 * verified by the auth server when this is called, so it is only decoded.
 */
export function sessionIdFromToken(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { session_id?: unknown }
    return typeof claims.session_id === 'string' ? claims.session_id : null
  } catch {
    return null
  }
}
