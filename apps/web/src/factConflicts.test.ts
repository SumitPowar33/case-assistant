import { expect, test } from 'vitest'
import { conflictPrompt, readConflicts, sources } from './factConflicts'

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
