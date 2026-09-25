import { describe, expect, it } from 'vitest'
import { credentialsToCsv, parseUserCsv, splitCsvLine } from '../lib/csv'

describe('splitting a CSV line', () => {
  it('splits on commas and trims', () => {
    expect(splitCsvLine('a, b ,c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps a comma inside quotes', () => {
    expect(splitCsvLine('priya,"Sharma, Priya",student'))
      .toEqual(['priya', 'Sharma, Priya', 'student'])
  })

  it('unescapes a doubled quote', () => {
    expect(splitCsvLine('a,"say ""hi"""')).toEqual(['a', 'say "hi"'])
  })

  it('keeps empty trailing fields', () => {
    expect(splitCsvLine('a,,')).toEqual(['a', '', ''])
  })
})

describe('parsing the user CSV', () => {
  it('reads the simple case', () => {
    const { users, problems } = parseUserCsv('student6,Student Six\nstudent7,Student Seven')
    expect(problems).toHaveLength(0)
    expect(users.map((u) => u.username)).toEqual(['student6', 'student7'])
    expect(users[0]!.displayName).toBe('Student Six')
    expect(users[0]!.role).toBe('student')
  })

  it('skips a header row when there is one', () => {
    const { users } = parseUserCsv('username,display_name,role\nstudent6,Student Six,student')
    expect(users).toHaveLength(1)
    expect(users[0]!.username).toBe('student6')
  })

  it('does not mistake a real row for a header', () => {
    const { users } = parseUserCsv('student6,Student Six')
    expect(users).toHaveLength(1)
  })

  it('ignores blank lines', () => {
    const { users, problems } = parseUserCsv('student6,Six\n\n\nstudent7,Seven\n')
    expect(users).toHaveLength(2)
    expect(problems).toHaveLength(0)
  })

  it('lowercases the username', () => {
    expect(parseUserCsv('Student6,Six').users[0]!.username).toBe('student6')
  })

  it('falls back to the username when no display name is given', () => {
    expect(parseUserCsv('student6').users[0]!.displayName).toBe('student6')
  })

  it('reads the role when present', () => {
    expect(parseUserCsv('boss,The Boss,admin').users[0]!.role).toBe('admin')
  })

  it('rejects an unknown role rather than guessing', () => {
    const { users, problems } = parseUserCsv('boss,The Boss,superuser')
    expect(users).toHaveLength(0)
    expect(problems[0]!.message).toMatch(/Unknown role/)
  })
})

describe('problems are reported with their line', () => {
  it('rejects an invalid username', () => {
    const { users, problems } = parseUserCsv('ok_user,Fine\nNo Spaces Here,Bad')
    expect(users).toHaveLength(1)
    expect(problems).toHaveLength(1)
    expect(problems[0]!.line).toBe(2)
    expect(problems[0]!.message).toMatch(/not a valid username/)
  })

  it('rejects a username that is too short', () => {
    expect(parseUserCsv('ab,Too Short').problems[0]!.message).toMatch(/not a valid username/)
  })

  it('catches a duplicate inside the file', () => {
    const { users, problems } = parseUserCsv('student6,Six\nstudent6,Six Again')
    expect(users).toHaveLength(1)
    expect(problems[0]!.line).toBe(2)
    expect(problems[0]!.message).toMatch(/more than once/)
  })

  it('reports a row with no username at all', () => {
    const { problems } = parseUserCsv(',Nobody')
    expect(problems[0]!.message).toMatch(/No username/)
  })

  it('keeps the good rows alongside the bad', () => {
    const { users, problems } = parseUserCsv('good1,One\nBAD NAME,Two\ngood2,Three')
    expect(users.map((u) => u.username)).toEqual(['good1', 'good2'])
    expect(problems).toHaveLength(1)
  })
})

describe('writing the credentials back out', () => {
  it('produces a header and a row per account', () => {
    expect(credentialsToCsv([{ username: 'a', password: 'p1' }, { username: 'b', password: 'p2' }]))
      .toBe('username,password\na,p1\nb,p2')
  })

  it('quotes a value containing a comma', () => {
    expect(credentialsToCsv([{ username: 'a', password: 'p,1' }]))
      .toBe('username,password\na,"p,1"')
  })
})

describe('quoted fields across lines', () => {
  it('keeps a newline inside quotes in one row', () => {
    const { users, problems } = parseUserCsv('priya,"Priya\nSharma",student\nstudent7,Seven')
    expect(problems).toHaveLength(0)
    expect(users.map((u) => u.username)).toEqual(['priya', 'student7'])
    expect(users[0]!.displayName).toBe('Priya Sharma')
    // Line numbers still point at where each row starts.
    expect(users[1]!.line).toBe(3)
  })

  it('reports an unterminated quote at the line it starts on', () => {
    const { users, problems } = parseUserCsv('good1,One\n"broken,Two\ngood2,Three')
    expect(users.map((u) => u.username)).toEqual(['good1'])
    expect(problems[0]!.line).toBe(2)
  })

  it('handles Windows line endings', () => {
    expect(parseUserCsv('a_1,One\r\nb_2,Two\r\n').users).toHaveLength(2)
  })
})

describe('header detection', () => {
  it('imports a first student called "user"', () => {
    const { users } = parseUserCsv('user,Some User\nstudent7,Seven')
    expect(users.map((u) => u.username)).toEqual(['user', 'student7'])
  })

  it('imports a first student called "name"', () => {
    expect(parseUserCsv('name,Name Person').users.map((u) => u.username)).toEqual(['name'])
  })

  it('imports a lone "user" row', () => {
    expect(parseUserCsv('user').users).toHaveLength(1)
  })

  it('still recognises the usual header shapes', () => {
    expect(parseUserCsv('user,name\nstudent6,Six').users.map((u) => u.username)).toEqual(['student6'])
    expect(parseUserCsv('Username,Display Name,Role\nstudent6,Six').users).toHaveLength(1)
    expect(parseUserCsv('username\nstudent6').users.map((u) => u.username)).toEqual(['student6'])
  })

  it('only treats the first row as a header', () => {
    const { users, problems } = parseUserCsv('student6,Six\nusername,display_name')
    expect(users.map((u) => u.username)).toEqual(['student6', 'username'])
    expect(problems).toHaveLength(0)
  })
})

describe('extra columns', () => {
  it('imports the row but warns', () => {
    const { users, warnings } = parseUserCsv('priya,Sharma, Priya,student')
    expect(users).toHaveLength(0) // " Priya" is not a role
    expect(warnings).toHaveLength(0)

    const ok = parseUserCsv('priya,Priya,student,extra')
    expect(ok.users).toHaveLength(1)
    expect(ok.warnings[0]!.line).toBe(1)
    expect(ok.warnings[0]!.message).toMatch(/extra column/)
  })

  it('does not warn about trailing empty columns', () => {
    expect(parseUserCsv('priya,Priya,student,,').warnings).toHaveLength(0)
  })
})
