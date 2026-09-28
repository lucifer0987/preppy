#!/usr/bin/env tsx
/**
 * Writes a run of valid papers, for filling a development database.
 *
 *   npm run papers:test -- --days 7 --from 2026-09-29 --out .papers
 *
 * This only writes files. Nothing here touches a database: upload them the way
 * an admin would, so the data arrives by the same path a real paper does and
 * the validator has its say.
 *
 * WHY THE QUESTIONS ARE GENERATED RATHER THAN COPIED
 *
 * Seven copies of one paper exercise nothing: the archive shows the same
 * questions seven times, and a solution read once is read for all of them. So
 * the arithmetic and reasoning items are built from templates with the numbers
 * chosen per day and the answer COMPUTED, never written down -- a generated
 * paper cannot disagree with itself. The English and knowledge items are facts
 * rather than sums, so those come from banks and rotate; across seven days some
 * recur, which is honest test data rather than a claim of seven fresh papers.
 *
 * Every paper is still checked with `npm run check` before it is uploaded, and
 * that is the gate that matters.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_PATTERN, type SectionCode } from '../lib/types'

type Q = { text: string; options: string[]; answerIndex: number; solution: string; tag: string;
           difficulty: 'Easy' | 'Medium' | 'Hard' }

/** Deterministic per-day numbers, so a given day always writes the same paper. */
function rng(seed: number) {
  let s = seed * 2654435761 % 2147483647
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

/** Four distinct options with the right answer among them, placed by the day. */
function opts(correct: string, wrong: string[], r: () => number): { options: string[]; answerIndex: number } {
  const distinct = [...new Set(wrong.filter((w) => w !== correct))].slice(0, 3)
  while (distinct.length < 3) distinct.push(`${distinct.length + 1} of these`)
  const at = Math.floor(r() * 4)
  const options = [...distinct]
  options.splice(at, 0, correct)
  return { options, answerIndex: at }
}

// ---------------------------------------------------------------- quantitative
const QUANT: ((r: () => number) => Q)[] = [
  (r) => { const p = int(r, 8, 30) * 1000, rate = int(r, 4, 12), t = int(r, 2, 5)
    const si = (p * rate * t) / 100
    return { text: `The simple interest on Rs ${p.toLocaleString('en-IN')} at ${rate}% per annum for ${t} years is:`,
      ...opts(`Rs ${si.toLocaleString('en-IN')}`, [`Rs ${(si + p * rate / 100).toLocaleString('en-IN')}`,
        `Rs ${(si - p * rate / 100).toLocaleString('en-IN')}`, `Rs ${(si * 2).toLocaleString('en-IN')}`], r),
      solution: `SI = (${p} x ${rate} x ${t})/100 = Rs ${si.toLocaleString('en-IN')}.`,
      tag: 'Simple-Interest', difficulty: 'Easy' } },
  (r) => { const d = int(r, 120, 400), t = int(r, 8, 25)
    const kmh = Math.round((d / t) * 3.6 * 100) / 100
    return { text: `A train ${d} m long crosses a pole in ${t} seconds. Its speed is:`,
      ...opts(`${kmh} km/h`, [`${Math.round(kmh * 1.2 * 100) / 100} km/h`, `${Math.round(kmh * 0.8 * 100) / 100} km/h`,
        `${Math.round((d / t) * 100) / 100} km/h`], r),
      solution: `Speed = ${d}/${t} = ${Math.round((d / t) * 100) / 100} m/s = ${Math.round((d / t) * 100) / 100} x 18/5 = ${kmh} km/h.`,
      tag: 'Speed-Time-Distance', difficulty: 'Easy' } },
  (r) => { const n = int(r, 5, 9) * 2, start = int(r, 10, 40) * 2
    const nums = Array.from({ length: 5 }, (_, i) => start + 2 * i)
    const avg = nums.reduce((a, b) => a + b, 0) / 5
    return { text: `The average of five consecutive even numbers beginning ${start} is:`,
      ...opts(String(avg), [String(avg + 2), String(avg - 2), String(avg + n)], r),
      solution: `The numbers are ${nums.join(', ')}. For five consecutive even numbers the average is the middle term, ${avg}.`,
      tag: 'Averages', difficulty: 'Easy' } },
  (r) => { const up = int(r, 20, 60), disc = pick(r, [10, 20, 25, 40])
    const sp = 100 * (1 + up / 100) * (1 - disc / 100)
    const profit = Math.round((sp - 100) * 100) / 100
    return { text: `A shopkeeper marks an article ${up}% above cost price and allows a discount of ${disc}%. His profit percentage is:`,
      ...opts(`${profit}%`, [`${Math.round((up - disc) * 100) / 100}%`, `${Math.round((profit + 5) * 100) / 100}%`,
        `${Math.round((profit - 3) * 100) / 100}%`], r),
      solution: `Let CP = 100. MP = ${100 + up}. SP = ${100 + up} x ${(100 - disc) / 100} = ${Math.round(sp * 100) / 100}. Profit = ${profit}%.`,
      tag: 'Profit-Loss', difficulty: 'Medium' } },
  (r) => { const a = int(r, 6, 20), b = int(r, 6, 20) + 2
    const together = Math.round((a * b) / (a + b) * 100) / 100
    return { text: `Two pipes A and B fill a tank in ${a} minutes and ${b} minutes. Opened together, the tank fills in:`,
      ...opts(`${together} minutes`, [`${Math.round((a + b) / 2 * 100) / 100} minutes`, `${a + b} minutes`,
        `${Math.round((together + 1.5) * 100) / 100} minutes`], r),
      solution: `1/${a} + 1/${b} = ${(a + b)}/${a * b}. Time = ${a * b}/${a + b} = ${together} minutes.`,
      tag: 'Pipes-Cisterns', difficulty: 'Medium' } },
  (r) => { const total = int(r, 12, 40) * 100, x = pick(r, [2, 3, 4, 5]), y = pick(r, [3, 5, 7, 9])
    const share = Math.round((total * x) / (x + y))
    return { text: `Rs ${total.toLocaleString('en-IN')} is divided between two people in the ratio ${x}:${y}. The larger share, if ${x} > ${y}, is the first; otherwise the first share is:`,
      ...opts(`Rs ${share.toLocaleString('en-IN')}`, [`Rs ${(total - share).toLocaleString('en-IN')}`,
        `Rs ${Math.round(total / 2).toLocaleString('en-IN')}`, `Rs ${Math.round(total * x / (x + y) + 100).toLocaleString('en-IN')}`], r),
      solution: `First share = ${total} x ${x}/(${x}+${y}) = Rs ${share.toLocaleString('en-IN')}.`,
      tag: 'Ratio-Proportion', difficulty: 'Easy' } },
  (r) => { const base = int(r, 3, 9), n = int(r, 4, 6)
    const series = Array.from({ length: n }, (_, i) => base * Math.pow(2, i))
    const next = base * Math.pow(2, n)
    return { text: `Find the next term: ${series.join(', ')}, ?`,
      ...opts(String(next), [String(next + base), String(next - base), String(next * 2)], r),
      solution: `Each term doubles the one before it, so the next is ${series[n - 1]} x 2 = ${next}.`,
      tag: 'Number-Series', difficulty: 'Easy' } },
  (r) => { const son = int(r, 8, 20), k = pick(r, [3, 4, 5])
    const father = son * k
    return { text: `A father is ${k} times as old as his son, who is ${son}. In how many years will the father be twice the son's age?`,
      ...opts(String(father - 2 * son), [String(father - son), String(son), String(father)], r),
      solution: `Father is ${father}. Need ${father} + x = 2(${son} + x), so x = ${father - 2 * son}.`,
      tag: 'Ages', difficulty: 'Medium' } },
  (r) => { const still = int(r, 8, 18), stream = int(r, 2, 5)
    return { text: `A boat travels at ${still} km/h in still water and the stream runs at ${stream} km/h. Its downstream speed is:`,
      ...opts(`${still + stream} km/h`, [`${still - stream} km/h`, `${still} km/h`, `${still + 2 * stream} km/h`], r),
      solution: `Downstream = still water + stream = ${still} + ${stream} = ${still + stream} km/h.`,
      tag: 'Boats-Streams', difficulty: 'Easy' } },
  (r) => { const n = int(r, 200, 900), p = pick(r, [12, 15, 20, 25, 30])
    const v = Math.round(n * p) / 100
    return { text: `${p}% of ${n} is:`,
      ...opts(String(v), [String(Math.round(n * (p + 5)) / 100), String(Math.round(n * (p - 5)) / 100), String(Math.round(n * p / 10) / 100)], r),
      solution: `${p}% of ${n} = ${n} x ${p}/100 = ${v}.`,
      tag: 'Percentage', difficulty: 'Easy' } },
]

// ---------------------------------------------------------------- reasoning
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const shift = (w: string, by: number) =>
  [...w].map((c) => ALPHA[(ALPHA.indexOf(c) + by + 26) % 26]).join('')
const WORDS = ['CHAIR', 'TABLE', 'PLANT', 'MOUSE', 'BRAIN', 'CLOUD', 'STONE', 'HEART', 'LIGHT', 'WATER']

const REASONING: ((r: () => number) => Q)[] = [
  (r) => { const by = pick(r, [1, 2, -1]), a = pick(r, WORDS), b = pick(r, WORDS.filter((w) => w !== a))
    const dir = by > 0 ? `+${by}` : String(by)
    return { text: `In a certain code ${a} is written as ${shift(a, by)}. How is ${b} written in that code?`,
      ...opts(shift(b, by), [shift(b, by + 1), shift(b, -by), [...shift(b, by)].reverse().join('')], r),
      solution: `Each letter moves ${dir} in the alphabet, so ${b} becomes ${shift(b, by)}.`,
      tag: 'Coding-Decoding', difficulty: 'Medium' } },
  (r) => { const [a, b, c] = pick(r, [[3, 4, 5], [6, 8, 10], [9, 12, 15], [5, 12, 13]] as const)
    return { text: `A man walks ${a} km north, then ${b} km east. How far is he from his starting point?`,
      ...opts(`${c} km`, [`${a + b} km`, `${b - a} km`, `${Math.round(Math.sqrt(a * a + b * b) + 2)} km`], r),
      solution: `The path makes a right angle, so the distance is the hypotenuse: root(${a}^2 + ${b}^2) = ${c} km.`,
      tag: 'Direction-Sense', difficulty: 'Medium' } },
  (r) => { const total = int(r, 25, 45), fromTop = int(r, 5, 15)
    return { text: `In a row of ${total} students, Anil is ${fromTop}th from the top. What is his rank from the bottom?`,
      ...opts(String(total - fromTop + 1), [String(total - fromTop), String(fromTop), String(total - fromTop + 2)], r),
      solution: `Rank from bottom = ${total} - ${fromTop} + 1 = ${total - fromTop + 1}.`,
      tag: 'Order-Ranking', difficulty: 'Easy' } },
  (r) => { const n = int(r, 4, 12)
    return { text: `Which letter is ${n}th from the left in the English alphabet?`,
      ...opts(ALPHA[n - 1]!, [ALPHA[n]!, ALPHA[n - 2]!, ALPHA[26 - n]!], r),
      solution: `Counting from A, the ${n}th letter is ${ALPHA[n - 1]}.`,
      tag: 'Alphabet-Test', difficulty: 'Easy' } },
  (r) => { const rel = pick(r, [
      { q: "pointing to a photograph, a man said, 'She is the daughter of my grandfather's only son'", a: 'Sister' },
      { q: "pointing to a woman, a boy said, 'She is the mother of my father's only brother'", a: 'Grandmother' },
      { q: "pointing to a man, a girl said, 'He is the son of my mother's only sister'", a: 'Cousin' },
      { q: "pointing to a boy, a woman said, 'He is the son of my husband's father's only son'", a: 'Son' }] as const)
    return { text: `${rel.q[0]!.toUpperCase()}${rel.q.slice(1)}. How is that person related to him or her?`,
      ...opts(rel.a, ['Aunt', 'Niece', 'Mother'].filter((x) => x !== rel.a), r),
      solution: `Working the relation outwards from the speaker gives: ${rel.a}.`,
      tag: 'Blood-Relations', difficulty: 'Medium' } },
  (r) => { const [w, x, y, z] = pick(r, [['P','Q','R','S'], ['A','B','C','D'], ['M','N','O','P'],
      ['J','K','L','M'], ['W','X','Y','Z'], ['E','F','G','H']] as const)
    return { text: `If ${w} > ${x} >= ${y} and ${y} > ${z}, which conclusion follows? I. ${w} > ${z}   II. ${x} > ${z}`,
      ...opts('Both conclusions follow', ['Only conclusion I follows', 'Only conclusion II follows', 'Neither conclusion follows'], r),
      solution: `${w} > ${x} >= ${y} > ${z} gives ${w} > ${z}, and ${x} >= ${y} > ${z} gives ${x} > ${z}, so both follow.`,
      tag: 'Inequality', difficulty: 'Medium' } },
  (r) => { const base = int(r, 2, 6), step = int(r, 3, 9), n = 5
    const series = Array.from({ length: n }, (_, i) => base + step * i)
    return { text: `Find the missing term: ${series.slice(0, 4).join(', ')}, ?`,
      ...opts(String(series[4]), [String(series[4]! + step), String(series[4]! - 1), String(series[3]! * 2)], r),
      solution: `The series adds ${step} each time, so the next term is ${series[3]} + ${step} = ${series[4]}.`,
      tag: 'Number-Series', difficulty: 'Easy' } },
  (r) => { const day = pick(r, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const n = int(r, 10, 60)
    const ans = days[(days.indexOf(day) + n) % 7]!
    return { text: `If today is ${day}, what day will it be after ${n} days?`,
      ...opts(ans, days.filter((d) => d !== ans).slice(0, 3), r),
      solution: `${n} mod 7 = ${n % 7}, so count ${n % 7} day(s) on from ${day}: ${ans}.`,
      tag: 'Calendar', difficulty: 'Medium' } },
]

// ---------------------------------------------------------------- english & pk
type Fact = { text: string; correct: string; wrong: string[]; solution: string; tag: string;
              difficulty: 'Easy' | 'Medium' | 'Hard' }

const ENGLISH_BANK: Fact[] = [
  { text: 'Choose the word closest in meaning to ABUNDANT.', correct: 'Plentiful', wrong: ['Scarce', 'Hidden', 'Costly'], solution: 'Abundant means existing in large quantity, so plentiful is closest.', tag: 'Synonyms', difficulty: 'Easy' },
  { text: 'Choose the word most opposite in meaning to CANDID.', correct: 'Evasive', wrong: ['Frank', 'Direct', 'Truthful'], solution: 'Candid means open and frank; evasive is its opposite.', tag: 'Antonyms', difficulty: 'Medium' },
  { text: 'Choose the correctly spelt word.', correct: 'Accommodate', wrong: ['Acommodate', 'Accomodate', 'Acomodate'], solution: 'Accommodate takes a double c and a double m.', tag: 'Spelling', difficulty: 'Easy' },
  { text: 'Fill in the blank: The committee ____ its report yesterday.', correct: 'submitted', wrong: ['submit', 'submitting', 'has submit'], solution: '"Yesterday" fixes the past simple, so "submitted".', tag: 'Tenses', difficulty: 'Easy' },
  { text: 'Choose the word closest in meaning to METICULOUS.', correct: 'Careful', wrong: ['Careless', 'Rapid', 'Generous'], solution: 'Meticulous means showing great attention to detail.', tag: 'Synonyms', difficulty: 'Medium' },
  { text: 'Identify the error: "Neither of the two answers are correct."', correct: 'are correct', wrong: ['Neither of', 'the two', 'No error'], solution: '"Neither" is singular, so the verb should be "is correct".', tag: 'Subject-Verb-Agreement', difficulty: 'Medium' },
  { text: 'Choose the one-word substitution: a person who speaks many languages.', correct: 'Polyglot', wrong: ['Linguist', 'Orator', 'Philologist'], solution: 'A polyglot is someone who knows and uses several languages.', tag: 'Vocabulary', difficulty: 'Medium' },
  { text: 'Fill in the blank: She is senior ____ me by three years.', correct: 'to', wrong: ['than', 'from', 'over'], solution: 'Latin comparatives such as senior and junior take "to", not "than".', tag: 'Prepositions', difficulty: 'Medium' },
  { text: 'Choose the word most opposite in meaning to PROLIFIC.', correct: 'Unproductive', wrong: ['Fertile', 'Abundant', 'Creative'], solution: 'Prolific means producing much; unproductive is its opposite.', tag: 'Antonyms', difficulty: 'Medium' },
  { text: 'Choose the correctly spelt word.', correct: 'Privilege', wrong: ['Priviledge', 'Privilage', 'Previlege'], solution: 'Privilege has no d and ends -lege.', tag: 'Spelling', difficulty: 'Easy' },
  { text: 'Fill in the blank: He has been working here ____ 2019.', correct: 'since', wrong: ['for', 'from', 'during'], solution: '"Since" marks a point in time; "for" marks a length of time.', tag: 'Prepositions', difficulty: 'Easy' },
  { text: 'Choose the word closest in meaning to MITIGATE.', correct: 'Lessen', wrong: ['Worsen', 'Ignore', 'Delay'], solution: 'To mitigate is to make less severe.', tag: 'Synonyms', difficulty: 'Medium' },
  { text: 'Identify the error: "The number of applicants have risen sharply."', correct: 'have risen', wrong: ['The number of', 'applicants', 'sharply'], solution: '"The number of" takes a singular verb: "has risen".', tag: 'Subject-Verb-Agreement', difficulty: 'Medium' },
  { text: 'Choose the one-word substitution: something that cannot be corrected.', correct: 'Incorrigible', wrong: ['Incurable', 'Illegible', 'Intangible'], solution: 'Incorrigible describes what cannot be corrected or reformed.', tag: 'Vocabulary', difficulty: 'Hard' },
  { text: 'Fill in the blank: Hardly had he arrived ____ the meeting began.', correct: 'when', wrong: ['than', 'then', 'that'], solution: '"Hardly ... when" is the fixed pair; "no sooner" pairs with "than".', tag: 'Conjunctions', difficulty: 'Hard' },
]

const PK_BANK: Fact[] = [
  { text: 'The default port number for HTTPS is:', correct: '443', wrong: ['80', '21', '8080'], solution: 'HTTPS is assigned port 443; 80 is plain HTTP.', tag: 'Networking-Ports', difficulty: 'Easy' },
  { text: 'Which layer of the OSI model performs end-to-end error recovery and flow control?', correct: 'Transport', wrong: ['Network', 'Data Link', 'Session'], solution: 'The transport layer (layer 4) provides end-to-end delivery, error recovery and flow control.', tag: 'Networking-OSI', difficulty: 'Medium' },
  { text: 'A relation is in 3NF if it is in 2NF and:', correct: 'no non-prime attribute is transitively dependent on the key', wrong: ['every attribute is atomic', 'it has no partial dependency', 'every determinant is a candidate key'], solution: '3NF removes transitive dependency of non-prime attributes on the primary key. The last option describes BCNF.', tag: 'DBMS-Normalisation', difficulty: 'Medium' },
  { text: 'The time complexity of binary search on a sorted array of n elements is:', correct: 'O(log n)', wrong: ['O(n)', 'O(n log n)', 'O(1)'], solution: 'Each comparison halves the search space, giving O(log n).', tag: 'Algorithms', difficulty: 'Easy' },
  { text: 'Which SQL clause filters rows after grouping?', correct: 'HAVING', wrong: ['WHERE', 'GROUP BY', 'ORDER BY'], solution: 'WHERE filters rows before grouping; HAVING filters the groups afterwards.', tag: 'SQL', difficulty: 'Easy' },
  { text: 'In OOP, the ability of one interface to be used for a general class of actions is:', correct: 'Polymorphism', wrong: ['Encapsulation', 'Inheritance', 'Abstraction'], solution: 'Polymorphism lets one interface serve several underlying forms.', tag: 'OOP', difficulty: 'Easy' },
  { text: 'Which scheduling algorithm can cause starvation of long processes?', correct: 'Shortest Job First', wrong: ['Round Robin', 'First Come First Served', 'FIFO'], solution: 'SJF always prefers shorter jobs, so a long job may never be scheduled.', tag: 'OS-Scheduling', difficulty: 'Medium' },
  { text: 'A primary key differs from a candidate key in that:', correct: 'it is the candidate key chosen to identify rows', wrong: ['it may contain nulls', 'it must be a single column', 'it is always indexed last'], solution: 'Every primary key is a candidate key; the primary key is simply the one chosen.', tag: 'DBMS-Keys', difficulty: 'Medium' },
  { text: 'Which data structure uses Last In First Out ordering?', correct: 'Stack', wrong: ['Queue', 'Linked list', 'Heap'], solution: 'A stack pushes and pops from the same end, giving LIFO order.', tag: 'Data-Structures', difficulty: 'Easy' },
  { text: 'The ACID property that guarantees a transaction is all or nothing is:', correct: 'Atomicity', wrong: ['Consistency', 'Isolation', 'Durability'], solution: 'Atomicity means the transaction either commits entirely or leaves no trace.', tag: 'DBMS-Transactions', difficulty: 'Easy' },
  { text: 'Which protocol resolves an IP address to a MAC address?', correct: 'ARP', wrong: ['DNS', 'DHCP', 'ICMP'], solution: 'The Address Resolution Protocol maps an IP address to a hardware address on a local network.', tag: 'Networking-Protocols', difficulty: 'Medium' },
  { text: 'The worst-case time complexity of quicksort is:', correct: 'O(n^2)', wrong: ['O(n log n)', 'O(log n)', 'O(n)'], solution: 'A consistently poor pivot gives O(n^2); the average case is O(n log n).', tag: 'Algorithms', difficulty: 'Medium' },
  { text: 'In the software development life cycle, which model assumes each phase completes before the next begins?', correct: 'Waterfall', wrong: ['Spiral', 'Agile', 'Prototype'], solution: 'The waterfall model runs strictly sequential phases.', tag: 'Software-Engineering', difficulty: 'Easy' },
  { text: 'Virtual memory is implemented mainly using:', correct: 'Paging', wrong: ['Spooling', 'Caching', 'Buffering'], solution: 'Paging maps virtual pages onto physical frames, letting a process exceed physical memory.', tag: 'OS-Memory', difficulty: 'Medium' },
  { text: 'Which normal form removes partial dependency on a composite key?', correct: '2NF', wrong: ['1NF', '3NF', 'BCNF'], solution: 'Second normal form removes partial dependency of a non-prime attribute on part of a composite key.', tag: 'DBMS-Normalisation', difficulty: 'Medium' },
  { text: 'The default port for SSH is:', correct: '22', wrong: ['23', '25', '53'], solution: 'SSH uses port 22; 23 is Telnet and 25 is SMTP.', tag: 'Networking-Ports', difficulty: 'Easy' },
  { text: 'A deadlock requires all four of these except:', correct: 'Preemption', wrong: ['Mutual exclusion', 'Hold and wait', 'Circular wait'], solution: 'Deadlock needs mutual exclusion, hold and wait, NO preemption, and circular wait.', tag: 'OS-Deadlock', difficulty: 'Hard' },
  { text: 'Which join returns every row from the left table and matching rows from the right?', correct: 'LEFT OUTER JOIN', wrong: ['INNER JOIN', 'RIGHT OUTER JOIN', 'CROSS JOIN'], solution: 'A left outer join keeps all left rows, filling unmatched right columns with nulls.', tag: 'SQL', difficulty: 'Easy' },
  { text: 'The space complexity of merge sort on an array of n elements is:', correct: 'O(n)', wrong: ['O(1)', 'O(log n)', 'O(n log n)'], solution: 'Merge sort needs an auxiliary array of size n for merging.', tag: 'Algorithms', difficulty: 'Medium' },
  { text: 'Which HTTP status code means the resource was not found?', correct: '404', wrong: ['500', '403', '301'], solution: '404 is Not Found; 403 is Forbidden and 500 is a server error.', tag: 'Networking-Protocols', difficulty: 'Easy' },
]

function fromFact(f: Fact, r: () => number): Q {
  const { options, answerIndex } = opts(f.correct, f.wrong, r)
  return { text: f.text, options, answerIndex, solution: f.solution, tag: f.tag, difficulty: f.difficulty }
}

/**
 * A section's worth of questions, rotated so consecutive days differ, and
 * deduplicated so one paper never asks the same thing twice.
 *
 * The templated items are drawn again with fresh numbers when they collide,
 * which is why this loops rather than indexes. A bank of facts cannot be
 * redrawn that way, so if it is too small to fill the section this throws --
 * a generator that quietly repeats itself is worse than one that stops.
 */
function build(code: SectionCode, count: number, day: number, r: () => number): Q[] {
  const templated = code === 'QUANT' || code === 'REASONING'
  const bank = code === 'QUANT' ? QUANT : code === 'REASONING' ? REASONING : null
  const facts = code === 'ENGLISH' ? ENGLISH_BANK : code === 'PK' ? PK_BANK : null
  const out: Q[] = []
  const seen = new Set<string>()
  const offset = day * (templated ? 3 : 5)
  for (let i = 0, tries = 0; out.length < count; i++, tries++) {
    if (tries > count * 40) {
      throw new Error(
        `Could not fill ${code} with ${count} distinct questions (${out.length} so far). ` +
        `Add more items to its bank.`)
    }
    const q = templated
      ? bank![(i + offset) % bank!.length]!(r)
      : fromFact(facts![(i + offset) % facts!.length]!, r)
    if (seen.has(q.text)) continue
    seen.add(q.text)
    out.push(q)
  }
  return out
}

/**
 * One day's paper, as the object that gets written to disk.
 *
 * Exported so tests/test-papers.test.ts can put it through the real validator:
 * a generator that can emit a paper the product would refuse is worse than no
 * generator, and nothing else would notice.
 */
export function buildPaper(day: number, date: string, number_: number): Record<string, unknown> {
  const r = rng(day + 1)
  let n = 1
  const sections = DEFAULT_PATTERN.map((shape) => {
    const qs = build(shape.code, shape.questions, day, r)
    return {
      code: shape.code,
      questionCount: shape.questions,
      durationMinutes: shape.minutes,
      marksCorrect: shape.marksCorrect,
      marksNegative: shape.marksNegative,
      questions: qs.map((q) => ({
        number: n++,
        text: q.text,
        options: Object.fromEntries(q.options.map((o, i) => [['A', 'B', 'C', 'D'][i], o])),
        answer: ['A', 'B', 'C', 'D'][q.answerIndex],
        solution: q.solution,
        tag: q.tag,
        difficulty: q.difficulty,
      })),
    }
  })
  return {
    format: 'preppy-paper',
    version: 1,
    date,
    title: `Daily Mock ${String(number_).padStart(3, '0')}`,
    sections,
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name: string, fallback: string) => {
    const i = argv.indexOf('--' + name)
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback
  }
  const days = Number(arg('days', '7'))
  const out = arg('out', '.papers')
  const from = arg('from', '')
  if (!from) { console.error('Give a start date: --from YYYY-MM-DD'); process.exit(2) }

  await mkdir(out, { recursive: true })
  const startNum = Number(arg('start-number', '2'))
  let n = 0
  for (let d = 0; d < days; d++) {
    const date = new Date(`${from}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + d)
    const iso = date.toISOString().slice(0, 10)
    const paper = buildPaper(d, iso, startNum + d)
    const title = paper['title'] as string
    const file = join(out, `${iso}-${title.toLowerCase().replace(/\s+/g, '-')}.json`)
    await writeFile(file, JSON.stringify(paper, null, 2) + '\n')
    console.log(`  ${iso}  ${title}  ->  ${file}`)
    n++
  }
  console.log(`\n${n} paper(s) written to ${out}/. Check them, then upload them as an admin:`)
  console.log(`  npm run check ${out}/<file>`)
}

if (process.argv[1] && process.argv[1].endsWith('test-papers.ts')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
