/**
 * Username rules.
 *
 * Pure and free of any server-only import, because the CSV parser and the
 * login form both need them and neither should have to drag the Supabase
 * clients along to ask whether a name is valid.
 */
export const USERNAME_DOMAIN = 'preppy.local'
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export function normaliseUsername(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Supabase Auth requires an email, so a username maps to a synthetic internal
 * address. It is never shown, never collected, and never sent mail.
 */
export function usernameToEmail(username: string): string {
  return `${normaliseUsername(username)}@${USERNAME_DOMAIN}`
}

export function emailToUsername(email: string): string {
  return email.replace(new RegExp(`@${USERNAME_DOMAIN}$`), '')
}
