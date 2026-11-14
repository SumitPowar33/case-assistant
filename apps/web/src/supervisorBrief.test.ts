import { expect, test } from 'vitest'
import { briefFacts, briefPrompt, rates, readBrief, type CaseRow, type Gap } from './supervisorBrief'

// Fictional data only.
const row = (over: Partial<CaseRow> = {}): CaseRow => ({
  fir_no: 7, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional Asha',
  deadline_kind: 'chargesheet_custody', due_on: '2026-11-20', days_left: 6, report_status: 'submitted', ...over,
})
const gaps: Gap[] = [
  { key: 'ingredient:cheating/deception', message: 'No evidence linked for: Deception of a person (BNS 318(4))', override: null },
  { key: 'second-link:p9', message: 'Fictional Ravi A1 is an account holder with no independent second link yet (kyc).' },
  { key: 'certificate:e3', message: 'Phone dump of Fictional Ravi is electronic evidence without a complete BSA 63(4) certificate' },
  { key: 'ingredient:cheating/inducement', message: 'No evidence linked for: Inducement (BNS 318(4))', override: { reason: 'accepted in writing' } },
  { key: 'odd:x', message: 'Something with Fictional Name' },
]

test('the facts carry the table and the open gaps, but no name: not the IO, an account holder, an evidence label or a notice addressee', () => {
  const facts = briefFacts(row(), gaps, false)
  expect(facts.map((f) => f.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
  expect(facts.map((f) => f.text)).toEqual([
    'FIR 7/2026, sections: BNS 318(4)',
    'nearest deadline: Chargesheet for an accused in custody, due on 2026-11-20 (6 days left)',
    'readiness gap: No evidence linked for: Deception of a person (BNS 318(4))',
    'readiness gap: an account holder has no independent second link yet',
    'readiness gap: an electronic item has no complete BSA 63(4) certificate',
    'readiness gap of another kind',
    "the final report was submitted and waits for the supervisor's decision",
    'an investigating officer is assigned',
  ])
  const all = briefPrompt(facts, 'en')
  expect(all).not.toMatch(/Fictional|Asha|Ravi|Inducement|Phone dump/)
  const notice = briefFacts(row({ deadline_kind: 'notice_reply:Fictional Bank', days_left: -2 }), [], false)
  expect(notice[1].text).toBe('nearest deadline: Reply to a notice, due on 2026-11-20 (overdue by 2 days)')
  expect(notice[2].text).toBe('the readiness check has no open gap')
})

test('each state of the report, the IO and the deadline is said in plain words', () => {
  const text = (r: Partial<CaseRow>, ioLeft = false) => briefFacts(row(r), [], ioLeft).map((f) => f.text).join(' | ')
  expect(text({ report_status: null })).toContain('the final report is not started; the investigating officer writes it')
  expect(text({ report_status: 'weird' })).toContain('not started')
  expect(text({ report_status: 'draft' })).toContain('a draft with the investigating officer')
  expect(text({ report_status: 'returned' })).toContain('returned to the investigating officer')
  expect(text({ report_status: 'approved' })).toContain('approved and waits to be signed')
  expect(text({ io_name: null })).toContain('no investigating officer is assigned; the supervisor assigns one')
  expect(text({}, true)).toContain('has left the station; the supervisor assigns a new one')
  expect(text({ days_left: 0 })).toContain('(due today)')
  expect(text({ deadline_kind: 'unknown_kind' })).toContain('nearest deadline: A deadline')
  expect(text({ deadline_kind: null, due_on: null, days_left: null, sections: '' })).toContain('no deadline is due')
  expect(text({ sections: '' })).toContain('sections: none recorded')
})

test('more than twelve open gaps are counted, not listed', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ key: `ingredient:c/i${i}`, message: `No evidence linked for: part ${i}` }))
  const facts = briefFacts(row(), many, false)
  expect(facts.filter((f) => f.text.startsWith('readiness gap:'))).toHaveLength(12)
  expect(facts.some((f) => f.text === 'and 3 more open readiness gaps')).toBe(true)
})

test('the prompt is in English with the language asked, and forbids rating, judging and predicting', () => {
  const p = briefPrompt(briefFacts(row(), [], false), 'mr')
  expect(p).toContain('in Marathi')
  expect(p).toContain('F1: FIR 7/2026')
  expect(p).toMatch(/Never rate, praise or blame an officer/)
  expect(p).toMatch(/never predict how the case will end/)
  expect(briefPrompt([], 'xx')).toContain('in English')
})

test('a sentence is shown only when it names known facts and holds only their numbers', () => {
  const facts = briefFacts(row(), gaps.slice(0, 1), false)
  const answer = JSON.stringify([
    { text: 'The chargesheet for FIR 7/2026 is due on 20 November 2026, in 6 days.', facts: ['F1', 'F2'] },
    { text: 'Evidence of deception is still to be linked (F3).', facts: ['F3', 'F3'] },
    { text: 'It is due in 9 days.', facts: ['F2'] },               // a number not in its facts
    { text: 'The report waits for your decision.', facts: ['F99'] }, // an unknown fact
    { text: 'No fact named.', facts: [] },
    { text: 'Facts not a list.', facts: 'F1' },
    { text: '', facts: ['F1'] },
    { text: 'x'.repeat(401), facts: ['F1'] },
    { text: 'The IO has been negligent.', facts: ['F5'] },
    { text: 'The accused is guilty.', facts: ['F1'] },
    { text: 'The case is likely to end in conviction.', facts: ['F1'] },
    { text: 'The chargesheet for FIR 7/2026 is due on 20 November 2026, in 6 days.', facts: ['F1', 'F2'] }, // repeated
    'not an object',
  ])
  const read = readBrief(`Here it is: ${answer}`, facts)
  expect(read.kind).toBe('brief')
  if (read.kind !== 'brief') return
  expect(read.lines.map((l) => l.text)).toEqual([
    'The chargesheet for FIR 7/2026 is due on 20 November 2026, in 6 days.',
    'Evidence of deception is still to be linked (F3).',
  ])
  expect(read.lines[1].facts.map((f) => f.id)).toEqual(['F3'])
  expect(read.dropped).toBe(7)
  expect(read.opinions).toBe(3)
})

test('numbers in Indian digits count as their value; an answer without a list is unreadable; at most eight sentences', () => {
  const facts = briefFacts(row(), [], false)
  const read = readBrief(JSON.stringify([{ text: 'आरोपपत्र ६ दिवसांत देय आहे.', facts: ['F2'] }]), facts)
  expect(read.kind === 'brief' && read.lines.length).toBe(1)
  expect(readBrief('The case is due soon.', facts)).toEqual({ kind: 'unreadable' })
  const ten = Array.from({ length: 10 }, (_, i) => ({ text: `Sentence ${'abcdefghij'[i]} on the report.`, facts: ['F4'] }))
  const capped = readBrief(JSON.stringify(ten), facts)
  expect(capped.kind === 'brief' && capped.lines.length).toBe(8)
})

test('rating, blaming, disciplining and predicting words are caught; plain briefing words are not', () => {
  for (const s of ['The IO was careless.', 'Poor work on this case.', 'The SHO should discipline the IO.', 'The officer failed in his duty.',
    'The IO performed well.', 'There is a good chance of success.', 'The accused will be acquitted.', 'A diligent officer.', 'Blame lies with the IO.'])
    expect(rates(s), s).toBe(true)
  for (const s of ['The chargesheet is due in 6 days.', 'The supervisor decides on the submitted report.', 'Evidence of deception is still to be linked.',
    'A new IO must be assigned.'])
    expect(rates(s), s).toBe(false)
})
