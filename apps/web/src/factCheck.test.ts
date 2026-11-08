import { expect, test } from 'vitest'
import { FACT_KINDS, FACT_PROMPT_VERSION, factPrompt, locate, readFacts } from './factCheck'

// Fictional data only.
const TEXT = 'On 28 October 2026 at about 10:40 a caller said he was from my bank.\nI shared a code. Rs 40,000 went out of my\naccount 004512349876 by UPI to fictional@okdemo, UTR 432109876543.'
const draft = (list: unknown) => JSON.stringify(list)

test('the prompt carries the text between markers, the kinds, and asks for exact quotes and no names', () => {
  const p = factPrompt(TEXT)
  expect(p).toContain(`<<<\n${TEXT}\n>>>`)
  for (const k of FACT_KINDS) expect(p).toContain(k)
  expect(p).toContain('copied exactly')
  expect(p).toContain('Do not list names of people')
  expect(p).toContain('never guess')
  expect(FACT_PROMPT_VERSION).toMatch(/^fir_extract\//)
})

test('a quote is found exactly, or across a line break or doubled space, and the stored quote is the text itself', () => {
  expect(locate(TEXT, 'Rs 40,000')).toEqual({ at: TEXT.indexOf('Rs 40,000'), quote: 'Rs 40,000' })
  expect(locate(TEXT, '  Rs 40,000  ')?.quote).toBe('Rs 40,000')
  expect(locate(TEXT, 'out of my account 004512349876')).toEqual({ at: TEXT.indexOf('out of my'), quote: 'out of my\naccount 004512349876' })
  expect(locate(TEXT, 'Rs  40,000')?.quote).toBe('Rs 40,000')
  expect(locate(TEXT, 'Rs 40,000 (approx.)')).toBeNull()
  expect(locate(TEXT, 'rs 40,000')).toBeNull()   // letter case counts, as in the database
  expect(locate(TEXT, '   ')).toBeNull()
  expect(locate('a (b) c', '(b)')?.quote).toBe('(b)')
  expect(locate('a [b]  c', '[b] c')?.quote).toBe('[b]  c')   // special characters are taken as they are
})

test('facts that point at the text are kept in text order; the rest are counted and the missing kinds listed', () => {
  const r = readFacts(draft([
    { kind: 'amount', value: 'Rs 40,000', quote: 'Rs 40,000 went out' },
    { kind: 'date', value: '28 October 2026', quote: 'On 28 October 2026' },
    { kind: 'Account', value: '004512349876', quote: 'account 004512349876' },
    { kind: 'upi', value: 'fictional@okdemo', quote: 'by UPI to fictional@okdemo' },
    { kind: 'utr', value: '432109876543', quote: 'UTR 432109876543' },
    { kind: 'phone', value: '9800000000', quote: 'a caller said' },           // the number is not in the quote
    { kind: 'amount', value: 'Rs 50,000', quote: 'Rs 50,000 went out' },      // not in the text
    { kind: 'name', value: 'the caller', quote: 'a caller' },                 // not a kind
    { kind: 'amount', value: 'Rs 40,000', quote: 'Rs 40,000' },               // the same fact again: shown once, not counted as wrong
    { kind: 'amount', value: 'forty thousand', quote: 'Rs 40,000' },          // a number kind without digits
    { kind: 'time', value: '', quote: 'at about 10:40' },                     // no value
    { kind: 'time', value: 'x'.repeat(201), quote: 'at about 10:40' },
    { kind: 'time', value: '10:40', quote: 'x'.repeat(501) },
    'not an object', null, { kind: 3, value: 4, quote: 5 },
  ]), TEXT)
  expect(r.kind).toBe('facts')
  if (r.kind !== 'facts') return
  expect(r.facts.map((f) => `${f.kind}:${f.value}`)).toEqual(['date:28 October 2026', 'amount:Rs 40,000', 'account:004512349876', 'upi:fictional@okdemo', 'utr:432109876543'])
  expect(r.facts[2].quote).toBe('account 004512349876')
  expect(r.dropped).toBe(10)
  expect(r.missing).toEqual(['time', 'place', 'phone'])
})

test('digits agree whatever the separators, so a corrected number in another format still counts', () => {
  const r = readFacts(draft([{ kind: 'amount', value: '40000', quote: 'Rs 40,000' }]), TEXT)
  expect(r.kind === 'facts' && r.facts.length).toBe(1)
})

test('the list is found inside fences or a sentence; anything else is unreadable', () => {
  const list = [{ kind: 'amount', value: 'Rs 40,000', quote: 'Rs 40,000' }]
  for (const d of ['```json\n' + draft(list) + '\n```', 'Here are the facts: ' + draft(list) + ' Check them.', '[demo draft] ' + draft(list), '[note] [x] ' + draft(list) + ' [end]']) {
    const r = readFacts(d, TEXT)
    expect(r.kind === 'facts' && r.facts.length, d).toBe(1)
  }
  const empty = readFacts('[]', TEXT)
  expect(empty).toEqual({ kind: 'facts', facts: [], dropped: 0, missing: [...FACT_KINDS] })
  for (const d of ['No facts.', '[demo draft] Read the FIR text below', '{"kind":"amount"}', '[{"kind": broken}]', '']) expect(readFacts(d, TEXT)).toEqual({ kind: 'unreadable' })
})

test('at most 40 facts are shown', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Rs ${i + 1}00`).join(', ')
  const r = readFacts(draft(Array.from({ length: 50 }, (_, i) => ({ kind: 'amount', value: `Rs ${i + 1}00`, quote: `Rs ${i + 1}00` }))), text)
  expect(r.kind === 'facts' && r.facts.length).toBe(40)
  expect(r.kind === 'facts' && r.dropped).toBe(0)
})
