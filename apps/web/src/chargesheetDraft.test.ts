import { describe, expect, it } from 'vitest'
import { DRAFT_PROMPT_VERSION, appendTo, decisionFor, draftPrompt, judges, readDraft, type Source } from './chargesheetDraft'

const FIR: Source = { id: 'FIR', kind: 'fir', who: null, date: null, text: 'On 3 Nov a caller said he was from my bank and Rs 40,000 went out of my account.' }
const S1: Source = { id: 'S1', kind: 'statement', who: 'W1', date: '2026-11-05T10:00:00Z', text: 'I saw the  accused\nat the ATM near the market.' }
const SOURCES = [FIR, S1]
const cite = (s: Source) => (s.kind === 'fir' ? 'FIR' : `statement of ${s.who}`)

describe('draftPrompt', () => {
  it('lists every piece with its id, the sections and the report language, and forbids opinions', () => {
    const p = draftPrompt(SOURCES, 'BNS 318(4)', 'mr')
    expect(p).toContain('Piece FIR (FIR text):\n<<<\n' + FIR.text + '\n>>>')
    expect(p).toContain('Piece S1 (statement):')
    expect(p).toContain(': BNS 318(4)).')
    expect(p).toContain('in Marathi')
    expect(p).toContain('guilty or innocent')
    expect(DRAFT_PROMPT_VERSION).toMatch(/^chargesheet_draft\//)
  })
  it('falls back to English, names a translation, and leaves out an empty section list', () => {
    const p = draftPrompt([{ ...S1, id: 'T1', kind: 'translation' }], '', 'xx')
    expect(p).toContain('in English')
    expect(p).toContain('Piece T1 (English translation of a statement):')
    expect(p).toContain('for each charge).')
  })
})

describe('judges', () => {
  it.each([
    'The accused is guilty of cheating.', 'The witness is credible.', 'W2 was lying about the time.', 'The charge is clearly proved.',
    'The offence is established beyond doubt.', 'A1 committed the offence.', 'Her account is reliable.', 'He is innocent.',
  ])('drops %s', (s) => expect(judges(s)).toBe(true))
  it.each([
    'The complainant stated that a caller said he was from her bank.', 'Rs 40,000 went out of the account on 3 Nov.',
    'W1 stated that he saw the accused at the ATM.',
  ])('keeps %s', (s) => expect(judges(s)).toBe(false))
})

describe('readDraft', () => {
  it('keeps sentences whose quote is words of the named piece, spaces and line breaks counted as one', () => {
    const r = readDraft('Here:\n```json\n' + JSON.stringify([
      { part: 'facts', text: 'The complainant stated  that Rs 40,000 left her account.', source: 'FIR', quote: 'Rs 40,000 went out of my account' },
      { part: 'Evidence', text: 'W1 stated that he saw the accused at the ATM.', source: 'S1', quote: 'I saw the accused at the ATM' },
    ]) + '\n```', SOURCES)
    expect(r).toEqual({ kind: 'sentences', dropped: 0, opinions: 0, sentences: [
      { part: 'facts', text: 'The complainant stated that Rs 40,000 left her account.', source: FIR, quote: 'Rs 40,000 went out of my account' },
      { part: 'evidence', text: 'W1 stated that he saw the accused at the ATM.', source: S1, quote: 'I saw the  accused\nat the ATM' },
    ] })
  })
  it('drops a wrong piece, a quote not in it, an unknown part, an empty or long text, and counts opinions apart', () => {
    const r = readDraft(JSON.stringify([
      { part: 'facts', text: 'A caller said he was from the bank.', source: 'S1', quote: 'a caller said he was from my bank' },   // quote is in the FIR, not S1
      { part: 'facts', text: 'Made up.', source: 'S9', quote: 'I saw' },
      { part: 'facts', text: 'Made up.', source: 'FIR', quote: 'a stranger came' },
      { part: 'opinion', text: 'x', source: 'FIR', quote: 'On 3 Nov' },
      { part: 'facts', text: '  ', source: 'FIR', quote: 'On 3 Nov' },
      { part: 'facts', text: 'x'.repeat(601), source: 'FIR', quote: 'On 3 Nov' },
      { part: 'facts', text: 'Long quote.', source: 'FIR', quote: 'y'.repeat(501) },
      { part: 'facts', text: 'No quote.', source: 'FIR' },
      'not an object', null,
      { part: 'evidence', text: 'The accused is guilty of cheating.', source: 'FIR', quote: 'On 3 Nov' },
      { part: 'facts', text: 'On 3 Nov a caller rang.', source: 'FIR', quote: 'On 3 Nov' },
      { part: 'facts', text: 'on 3 nov a caller rang.', source: 'FIR', quote: 'On 3 Nov' },   // the same sentence again
    ]), SOURCES)
    expect(r.kind === 'sentences' && r.sentences.map((s) => s.text)).toEqual(['On 3 Nov a caller rang.'])
    expect(r).toMatchObject({ dropped: 10, opinions: 1 })
  })
  it('keeps at most 60 sentences', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ part: 'facts', text: `Sentence ${i}.`, source: 'FIR', quote: 'On 3 Nov' }))
    const r = readDraft(JSON.stringify(many), SOURCES)
    expect(r.kind === 'sentences' && r.sentences.length).toBe(60)
  })
  it('says when the answer is not a list', () => {
    expect(readDraft('I cannot help with that.', SOURCES)).toEqual({ kind: 'unreadable' })
  })
})

describe('appendTo and decisionFor', () => {
  const read = readDraft(JSON.stringify([
    { part: 'facts', text: 'A caller rang on 3 Nov.', source: 'FIR', quote: 'On 3 Nov' },
    { part: 'evidence', text: 'W1 saw the accused at the ATM.', source: 'S1', quote: 'at the ATM' },
  ]), SOURCES)
  const all = read.kind === 'sentences' ? read.sentences : []
  it('adds the kept sentences of one part after the officer\'s words, each with its source', () => {
    expect(appendTo('', all, 'facts', cite)).toBe('A caller rang on 3 Nov. (FIR)')
    expect(appendTo('My words.  ', all, 'evidence', cite)).toBe('My words.\n\nW1 saw the accused at the ATM. (statement of W1)')
    expect(appendTo('My words.', [], 'facts', cite)).toBe('My words.')
  })
  it('is accepted when all are kept, edited when some, rejected when none or unreadable', () => {
    expect(decisionFor(read, 2)).toBe('accepted')
    expect(decisionFor(read, 1)).toBe('edited')
    expect(decisionFor(read, 0)).toBe('rejected')
    expect(decisionFor({ kind: 'unreadable' }, 0)).toBe('rejected')
  })
})
