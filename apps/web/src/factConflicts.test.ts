import { expect, test } from 'vitest'
import { CONFLICT_PROMPT_VERSION, conflictPrompt, readConflicts, sources } from './factConflicts'

// Fictional data only.
const FIR = 'On 21 August 2026 the complainant transferred Rs 9,80,000 to A/c 50100999888777 from phone 9800000001.'
const passages = [
  { kind: 'complaint', title: 'FIR complaint', text: FIR },                                  // the FIR itself: not a second source
  { kind: 'statement', title: 'Statement of W1', text: 'I paid Rs 9,00,000.' },             // statements are A3's
  { kind: 'diary', title: 'Case diary, 22 Aug 2026', text: 'Asked the bank.' },             // the police's own notes
  { kind: 'reply', title: 'Reply to notice BNSS_94 from Bank of Demo, received 25 Aug 2026', text: 'Debit of Rs 8,90,000 on 21-08-2026 to a/c 50100999888777.' },
  { kind: 'money', title: 'Transfer on 22 Aug 2026', text: 'Rs 980,000.00 from account 1111 to account 50100999888777 (A1)' },
  { kind: 'evidence', title: 'Evidence E1', text: '   ' },                                  // empty: left out
  { kind: 'search', title: 'Search and seizure memo, 23 Aug 2026', text: null },
]
const list = sources(FIR, passages)
const side = (source: string, value: string, quote: string) => ({ source, value, quote })
const entry = (a: unknown, b: unknown, kind: unknown = 'amount', topic: unknown = 'amount of the 21 August transfer') => ({ kind, topic, a, b })

test('the sources are the FIR and the documents that hold facts, each document with its title; no statement, diary or empty text', () => {
  expect(list.map((s) => s.id)).toEqual(['FIR', 'D1', 'D2'])
  expect(list[1].text.startsWith('Reply to notice BNSS_94 from Bank of Demo, received 25 Aug 2026: Debit')).toBe(true)
  expect(list[2].text).toBe('Transfer on 22 Aug 2026: Rs 980,000.00 from account 1111 to account 50100999888777 (A1)')
  expect(sources('  ', passages)[0].id).toBe('D1')
})

test('the prompt names every source by id, asks for fact kinds and values, and forbids saying which value is right', () => {
  const p = conflictPrompt(list)
  expect(p).toContain('Source FIR:')
  expect(p).toContain('Source D2:')
  expect(p).toContain('date, time, place, amount, utr, phone, account, upi')
  expect(p).toMatch(/Do not say which value is right, and do not name or judge any person/)
  expect(p).not.toContain('Statement of W1')
})

test('a conflict is kept only when both quotes are words of two sources, each holds its value and the values differ', () => {
  const draft = JSON.stringify([
    entry(side('FIR', 'Rs 9,80,000', 'transferred Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Debit of Rs 8,90,000')),
    entry(side('fir', '21 August 2026', 'On 21 August 2026'), side('d2', '22 Aug 2026', 'Transfer on 22 Aug 2026'), 'date', 'day of the transfer'),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D2', 'Rs 980,000.00', 'Rs 980,000.00')),           // the same amount written two ways
    entry(side('FIR', '50100999888777', 'A/c 50100999888777'), side('D1', '50100999888777', 'a/c 50100999888777'), 'account'),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('FIR', '21 August', 'On 21 August')),                // the same source twice
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,00,000', 'Debit of Rs 8,90,000')),        // the quote lacks the value
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Rs 8,90,001')),                 // the quote is not in D1
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D9', 'Rs 8,90,000', 'Rs 8,90,000')),                 // an unknown source
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Debit of Rs 8,90,000'), 'name'), // not a fact kind
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Debit of Rs 8,90,000'), 'amount', 'the bank is right and the complainant is lying'),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Debit of Rs 8,90,000'), 'amount', ''),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', '', 'Debit of Rs 8,90,000')),                   // no value
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'x'.repeat(201), 'Debit of Rs 8,90,000')),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'x'.repeat(501))),
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), 'D1'),                                                      // not an object
    entry(side('FIR', 'Rs 9,80,000', 'Rs 9,80,000'), { source: 1, value: 'Rs 8,90,000', quote: 'Rs 8,90,000' }),
    null,
  ])
  const r = readConflicts(`Here is the list:\n${draft}`, list)
  expect(r.kind).toBe('conflicts')
  if (r.kind !== 'conflicts') return
  expect(r.conflicts.map((c) => [c.kind, c.a.source, c.a.value, c.b.source, c.b.value])).toEqual([
    ['amount', 'FIR', 'Rs 9,80,000', 'D1', 'Rs 8,90,000'],
    ['date', 'FIR', '21 August 2026', 'D2', '22 Aug 2026'],
  ])
  expect(r.dropped).toBe(15)
})

test('a date or place is compared by its letters and digits, case and punctuation aside', () => {
  const two = [{ id: 'FIR', title: '', text: 'Met at Station Road.' }, { id: 'D1', title: '', text: 'Seized at station road' }]
  const r = readConflicts(JSON.stringify([entry(side('FIR', 'Station Road.', 'at Station Road'), side('D1', 'station road', 'at station road'), 'place', 'place')]), two)
  expect(r).toEqual({ kind: 'conflicts', conflicts: [], dropped: 1 })
})

test('an amount with paise is held by its quote; at most twenty conflicts; an empty list or an unreadable answer is told apart', () => {
  const two = [{ id: 'FIR', title: '', text: 'Paid Rs 1,200.50 in cash.' }, { id: 'D1', title: '', text: 'Received Rs 1,250.50.' }]
  const one = entry(side('FIR', 'Rs 1,200.50', 'Rs 1,200.50'), side('D1', '1250.50', 'Rs 1,250.50'))
  expect(readConflicts(JSON.stringify([one]), two)).toMatchObject({ kind: 'conflicts', dropped: 0 })
  expect(readConflicts(JSON.stringify(Array.from({ length: 25 }, () => one)), two)).toMatchObject({ kind: 'conflicts', dropped: 5 })
  expect(readConflicts('[]', list)).toEqual({ kind: 'conflicts', conflicts: [], dropped: 0 })
  expect(readConflicts('No differences.', list)).toEqual({ kind: 'unreadable' })
  // a value without a digit is not held by a number's quote
  expect(readConflicts(JSON.stringify([entry(side('FIR', 'nine lakh', 'Rs 9,80,000'), side('D1', 'Rs 8,90,000', 'Rs 8,90,000'))]), list)).toMatchObject({ dropped: 1 })
})

test('a number other than an amount is held and compared by all its digits, not its first group', () => {
  const two = sources('The caller used phone 9800000001.', [{ kind: 'reply', title: 'Reply of Demo Telecom', text: 'The number is 98000 00002.' }])
  const a = side('FIR', '98000 00001', 'phone 9800000001'), b = side('D1', '98000 00002', 'number is 98000 00002')
  expect(readConflicts(JSON.stringify([entry(a, b, 'phone', 'caller number')]), two)).toMatchObject({ kind: 'conflicts', dropped: 0, conflicts: [{ kind: 'phone' }] })
  // the quote holds only the first group of this value: it is not held
  const wrong = side('FIR', '98000 99999', 'phone 9800000001')
  expect(readConflicts(JSON.stringify([entry(wrong, b, 'phone', 'caller number')]), two)).toMatchObject({ conflicts: [], dropped: 1 })
})

test('paise count, and two dates or places that differ in one part only are two values', () => {
  const two = sources('Rs 980,000.00 was sent on 21 August from Demo Nagar.', [{ kind: 'reply', title: 'Reply', text: 'Rs 980,000.05 was sent on 22 August from Demo Pur on 21 April.' }])
  const pair = (kind: string, a: string, b: string) => entry(side('FIR', a, a), side('D1', b, b), kind, 'one fact')
  const read = readConflicts(JSON.stringify([pair('amount', 'Rs 980,000.00', 'Rs 980,000.05'), pair('date', '21 August', '22 August'), pair('date', '21 August', '21 April'), pair('place', 'Demo Nagar', 'Demo Pur')]), two)
  expect(read).toMatchObject({ kind: 'conflicts', dropped: 0 })
  expect(read.kind === 'conflicts' && read.conflicts).toHaveLength(4)
})

test('a quote of 500 characters, a value of 200 and a topic of 200 are the most taken; a source id may carry spaces', () => {
  const long = 'x'.repeat(600)
  const two = sources(`Place ${long}`, [{ kind: 'reply', title: 'Reply', text: `Place ${'y'.repeat(600)}` }])
  const one = (valueA: number, quoteA: number, topic: number, sourceA = 'FIR') =>
    readConflicts(JSON.stringify([entry(side(sourceA, 'x'.repeat(valueA), 'x'.repeat(quoteA)), side(' d1 ', 'y'.repeat(200), 'y'.repeat(500)), 'place', 't'.repeat(topic))]), two)
  expect(one(200, 500, 200, ' fir ')).toMatchObject({ dropped: 0, conflicts: [{ a: { source: 'FIR' }, b: { source: 'D1' } }] })
  expect(one(201, 500, 200)).toMatchObject({ dropped: 1 })
  expect(one(200, 501, 200)).toMatchObject({ dropped: 1 })
  expect(one(200, 500, 201)).toMatchObject({ dropped: 1 })
  // a quote that grows past 500 characters once it is found in the text (a line break counted as one space) is not taken
  const spread = sources(`Place ${'x '.repeat(250).trim().replace(/ /g, '   ')}`, [{ kind: 'reply', title: 'Reply', text: 'Place Demo Pur' }])
  const grown = entry(side('FIR', 'x', 'x '.repeat(200).trim()), side('D1', 'Demo Pur', 'Demo Pur'), 'place', 'place')
  expect(readConflicts(JSON.stringify([grown]), spread)).toMatchObject({ conflicts: [], dropped: 1 })
})

test('the prompt text is pinned to its version: change the version when the words change', () => {
  expect([CONFLICT_PROMPT_VERSION, conflictPrompt([{ id: 'FIR', title: 'FIR text', text: 'Fictional text.' }, { id: 'D1', title: 'Reply', text: 'Fictional reply.' }])]).toMatchInlineSnapshot(`
    [
      "fact_conflicts/values@1",
      "Below are the text of a police FIR and other documents of the same case (bank and telecom replies, money transfers, evidence and memos), each marked with an id (FIR, D1, D2 ...), possibly in different languages.
    List the facts on which two different sources give different values. A fact is one of these kinds: date, time, place, amount, utr, phone, account, upi (utr = bank transaction reference, upi = UPI id).
    Answer with only a JSON list. Each entry is an object with: "kind" (one of the kinds), "topic" (which fact, a few words in English, e.g. "amount of the 21 August transfer"), "a" and "b". "a" and "b" are objects of two different sources: {"source": "<id>", "value": "<the value that source gives, short>", "quote": "<words of that source, copied exactly, character for character, at most 200 characters, holding the value>"}.
    Rules: report only two values that really differ for the same fact, never a fact one source leaves out. Never guess or complete a number. Do not say which value is right, and do not name or judge any person. If there is no such fact, answer [].
    Source FIR:
    <<<
    Fictional text.
    >>>
    Source D1:
    <<<
    Fictional reply.
    >>>",
    ]
  `)
})

test('replies, the money trail, evidence, search memos and expert requests are sources, after the FIR', () => {
  const all = ['reply', 'money', 'evidence', 'search', 'expert'].map((kind) => ({ kind, title: `T ${kind}`, text: 'x' }))
  expect(sources('The FIR.', all).map((s) => `${s.id} ${s.title}`)).toEqual(['FIR FIR text', 'D1 T reply', 'D2 T money', 'D3 T evidence', 'D4 T search', 'D5 T expert'])
})

const two = (a: string, b: string) => [{ id: 'FIR', title: 'FIR text', text: a }, { id: 'D1', title: 'Reply', text: b }]
const claim = (kind: string, a: string, b: string, topic: unknown = 'the value') =>
  JSON.stringify([{ kind, topic, a: { source: 'FIR', value: a, quote: `A says ${a}` }, b: { source: 'D1', value: b, quote: `B says ${b}` } }])
const read = (kind: string, a: string, b: string, topic?: unknown) => {
  const r = readConflicts(claim(kind, a, b, topic === undefined ? 'the value' : topic), two(`A says ${a}`, `B says ${b}`))
  return r.kind === 'conflicts' ? r.conflicts.length : -1
}

test('the same value written two ways is no conflict, for every kind', () => {
  expect(read('amount', 'Rs 9,80,000', 'Rs 980,000.00')).toBe(0)
  expect(read('utr', '4321-0987', '4321 0987')).toBe(0)
  expect(read('phone', '98000-00001', '98000 00001')).toBe(0)
  expect(read('account', 'A/c 5010-0999', '50100999')).toBe(0)
  expect(read('date', '21 Aug.', '21 aug')).toBe(0)
  expect(read('amount', 'Rs 9,80,000', 'Rs 8,90,000')).toBe(1)
  expect(read('utr', '43210987', '43210988')).toBe(1)
  expect(read('date', '21 Aug', '22 Aug')).toBe(1)
})

test('a conflict needs a topic, which is trimmed', () => {
  expect(read('date', '21 Aug', '22 Aug', null)).toBe(0)
  expect(read('date', '21 Aug', '22 Aug', '   ')).toBe(0)
  const r = readConflicts(claim('date', ' 21 Aug ', '22 Aug', '  day of the transfer  '), two('A says  21 Aug ', 'B says 22 Aug'))
  expect(r).toMatchObject({ conflicts: [{ topic: 'day of the transfer', a: { value: '21 Aug' } }] })
})

test('a side whose quote is not a string, or is over 500 characters, is dropped without an error', () => {
  const list = two('A says 21 Aug', 'B says 22 Aug')
  for (const quote of [7, `A${' '.repeat(600)}says 21 Aug`]) {
    const answer = JSON.stringify([{ kind: 'date', topic: 'day', a: { source: 'FIR', value: '21 Aug', quote }, b: { source: 'D1', value: '22 Aug', quote: 'B says 22 Aug' } }])
    expect(readConflicts(answer, list)).toEqual({ kind: 'conflicts', conflicts: [], dropped: 1 })
  }
})
