import { USERNAME_PATTERN, normaliseUsername } from './username'

/**
 * Parsing the bulk-create CSV (PRD 6.9.3).
 *
 * Pure, so the awkward cases can be tested: a header row that may or may not
 * be there, quoted fields, a stray blank line, and duplicates inside the file
 * itself. Every row is reported with its line number, because a silent skip in
 * a bulk import is how someone ends up without an account on paper night.
 */

export interface CsvUser {
  line: number
  username: string
  displayName: string
  role: 'student' | 'admin'
}

export interface CsvProblem {
  line: number
  message: string
  raw: string
}

export interface CsvParseResult {
  users: CsvUser[]
  problems: CsvProblem[]
}

/** Splits one CSV line, honouring double quotes and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(field.trim()); field = ''
    } else {
      field += c
    }
  }
  out.push(field.trim())
  return out
}

const HEADER_WORDS = new Set(['username', 'user', 'display_name', 'displayname', 'name', 'role'])

export function parseUserCsv(text: string): CsvParseResult {
  const users: CsvUser[] = []
  const problems: CsvProblem[] = []
  const seen = new Set<string>()

  const lines = text.replace(/\r\n?/g, '\n').split('\n')

  lines.forEach((raw, i) => {
    const line = i + 1
    if (raw.trim() === '') return

    const cells = splitCsvLine(raw)
    const [usernameRaw = '', displayRaw = '', roleRaw = ''] = cells

    // A header row, if present, is recognised rather than rejected.
    if (i === 0 && HEADER_WORDS.has(usernameRaw.toLowerCase())) return

    const username = normaliseUsername(usernameRaw)
    if (!username) {
      problems.push({ line, raw, message: 'No username in this row.' })
      return
    }
    if (!USERNAME_PATTERN.test(username)) {
      problems.push({
        line, raw,
        message: `"${usernameRaw}" is not a valid username. Use 3 to 20 lowercase letters, numbers or underscores.`,
      })
      return
    }
    if (seen.has(username)) {
      problems.push({ line, raw, message: `"${username}" appears more than once in this file.` })
      return
    }

    const role = roleRaw.toLowerCase() === 'admin' ? 'admin' : 'student'
    if (roleRaw && !['admin', 'student', ''].includes(roleRaw.toLowerCase())) {
      problems.push({ line, raw, message: `Unknown role "${roleRaw}". Use student or admin.` })
      return
    }

    seen.add(username)
    users.push({
      line,
      username,
      // A missing display name is not worth rejecting a row over.
      displayName: displayRaw || username,
      role,
    })
  })

  return { users, problems }
}

/** The created accounts, as a file the admin can keep until they hand them out. */
export function credentialsToCsv(rows: { username: string; password: string }[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return ['username,password', ...rows.map((r) => `${escape(r.username)},${escape(r.password)}`)].join('\n')
}
