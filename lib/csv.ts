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
  /** Rows that were skipped, and why. */
  problems: CsvProblem[]
  /** Rows that were imported but had something odd about them. */
  warnings: CsvProblem[]
}

/** More than this in one import is refused; see bulkCreateAction. */
export const MAX_BULK_ROWS = 100

/** Splits one CSV line, honouring double quotes and escaped quotes. */
export function splitCsvLine(line: string): string[] {
  return splitCsvRecords(line)[0]?.cells ?? ['']
}

interface CsvRecord {
  /** 1-based line on which the record starts. */
  line: number
  raw: string
  cells: string[]
}

/**
 * Splits a whole file into records. Quotes are honoured across line breaks,
 * so a quoted field containing a newline stays one field rather than tearing
 * its row in two.
 */
function splitCsvRecords(text: string): CsvRecord[] {
  const src = text.replace(/\r\n?/g, '\n')
  const records: CsvRecord[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let startLine = 1
  let startIndex = 0

  const endRecord = (end: number) => {
    cells.push(field.trim())
    records.push({ line: startLine, raw: src.slice(startIndex, end), cells })
    cells = []; field = ''
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        if (c === '\n') line++
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      cells.push(field.trim()); field = ''
    } else if (c === '\n') {
      endRecord(i)
      line++
      startLine = line
      startIndex = i + 1
    } else {
      field += c
    }
  }
  // An unterminated quote swallows the rest of the file into one field; the
  // row then fails validation with its starting line, which is where to look.
  if (startIndex < src.length || records.length === 0) endRecord(src.length)
  return records
}

/**
 * Position by position, what a header row may say. Only a row matching this
 * in full is a header, so a first student who happens to be called "user" or
 * "name" is still imported.
 */
const HEADER_COLUMNS = [
  new Set(['username', 'user']),
  new Set(['display_name', 'displayname', 'display name', 'name']),
  new Set(['role']),
]

function isHeader(cells: string[]): boolean {
  const lower = cells.map((c) => c.toLowerCase())
  // A lone "username" column is a header; a lone "user" is a person.
  if (lower.length === 1) return lower[0] === 'username'
  return lower.length <= HEADER_COLUMNS.length && lower.every((c, i) => HEADER_COLUMNS[i]!.has(c))
}

export function parseUserCsv(text: string): CsvParseResult {
  const users: CsvUser[] = []
  const problems: CsvProblem[] = []
  const warnings: CsvProblem[] = []
  const seen = new Set<string>()

  splitCsvRecords(text).forEach(({ line, raw, cells }, i) => {
    if (cells.every((c) => c === '')) return

    // A header row, if present, is recognised rather than rejected.
    if (i === 0 && isHeader(cells)) return

    const [usernameRaw = '', displayRaw = '', roleRaw = ''] = cells

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

    // Most often an unquoted comma in a name, which shifts every column.
    const extra = cells.slice(3).filter((c) => c !== '')
    if (extra.length) {
      warnings.push({
        line, raw,
        message: `Ignored ${extra.length} extra column${extra.length === 1 ? '' : 's'} ` +
          `("${extra.join('", "')}"). Quote a display name that contains a comma.`,
      })
    }

    seen.add(username)
    users.push({
      line,
      username,
      // A missing display name is not worth rejecting a row over.
      // A newline inside a quoted name is tidied into a space.
      displayName: displayRaw.replace(/\s+/g, ' ') || username,
      role,
    })
  })

  return { users, problems, warnings }
}

/** The created accounts, as a file the admin can keep until they hand them out. */
export function credentialsToCsv(rows: { username: string; password: string }[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return ['username,password', ...rows.map((r) => `${escape(r.username)},${escape(r.password)}`)].join('\n')
}
