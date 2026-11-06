import { describe, expect, it } from 'vitest'
import { ASK_PROMPT_VERSION, NOT_IN_FILE, askPrompt, checkAnswer, chunks, refusal, retrieve, words, type Passage } from './askFile'

const P: Passage[] = [
  { id: 'P1', kind: 'complaint', title: 'FIR complaint', text: 'Fictional complaint. A transfer of Rs 9,80,000 was made on 21 August 2026 to account XXXX4471. The caller said he was a bank officer.' },
  { id: 'P2', kind: 'statement', title: 'Statement of W1', text: 'I saw the transfer on 22 August 2026.' },
  { id: 'P3', kind: 'diary', title: 'Case diary, 03 Nov 2026', text: 'Bank asked for the statement.' },
]

describe('refusal', () => {
  it.each([
    ['Is A3 guilty?', 'guilt'], ['Who committed the transfer?', 'guilt'], ['Did he do it', 'guilt'], ['Is the accused innocent', 'guilt'],
    ['Is the witness lying?', 'truth'], ['Is she telling the truth', 'truth'], ['Can we trust W1', 'truth'], ['how credible is the statement', 'truth'],
    ['Will he commit it again?', 'predict'], ['Is the accused likely to abscond', 'predict'], ['what is the chance A1 will flee', 'predict'],
  ])('%s is refused as %s', (q, why) => expect(refusal(q)).toBe(why))
  it.each(['When was the largest transfer?', 'What did W1 say about 22 August?', 'Which accounts received money', 'What is the description of item E-01'])(
    '%s may go on', (q) => expect(refusal(q)).toBeNull())
})

describe('words and chunks', () => {
  it('keeps meaningful words in any script and drops stop words and single letters', () => {
    expect(words('When was the Transfer of Rs 9,80,000 made? a x 5')).toEqual(['transfer', 'rs', '9', '80', '000', 'made', '5'])
    expect(words('हस्तांतरण कब हुआ')).toEqual(['हस्तांतरण', 'कब', 'हुआ'])
    expect(words('')).toEqual([])
  })
  it('cuts at sentence ends, joins short ones and splits one very long sentence', () => {
    expect(chunks('One. Two. Three.', 500)).toEqual(['One. Two. Three.'])
    expect(chunks('Aaaa. Bbbb. Cccc.', 10)).toEqual(['Aaaa.', 'Bbbb.', 'Cccc.'])
    expect(chunks('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
    expect(chunks('Line one\n\nLine two', 500)).toEqual(['Line one Line two'])
    expect(chunks('   ')).toEqual([])
  })
})

describe('retrieve', () => {
  it('finds the pieces that share words with the question, best first, tagged S1, S2', () => {
    const r = retrieve('When was the transfer on 21 August?', P)
    expect(r.map((s) => s.tag)).toEqual(['S1', 'S2'])
    expect(r[0].title).toBe('FIR complaint')
    expect(r[0].quote).toContain('21 August 2026')
    expect(r[1].title).toBe('Statement of W1')
  })
  it('matches the same first five letters of a long word, and counts numbers double', () => {
    expect(retrieve('transfers', P)[0].title).toBe('FIR complaint')
    expect(retrieve('22', P)[0].title).toBe('Statement of W1')
  })
  it('finds nothing for a question the file has no words for, or one made of stop words only', () => {
    expect(retrieve('Who owns the red car?', P)).toEqual([])
    expect(retrieve('what is the', P)).toEqual([])
  })
  it('keeps at most `limit` pieces and names the part of a long passage', () => {
    const long: Passage = { id: 'P9', kind: 'statement', title: 'Statement of W2', text: Array.from({ length: 20 }, (_, i) => `Sentence ${i} mentions the bank counter and the cashier at length.`).join(' ') }
    const r = retrieve('bank cashier', [long], 3)
    expect(r).toHaveLength(3)
    expect(r[0].title).toMatch(/^Statement of W2, part \d of \d$/)
  })
})

describe('prompt and answer check', () => {
  const sent = retrieve('When was the transfer?', P)
  it('the prompt holds the question, only the sent pieces and the rules', () => {
    const p = askPrompt(' When was the transfer? ', sent)
    expect(p).toContain('Question from the investigating officer: When was the transfer?')
    expect(p).toContain('[S1] FIR complaint: ')
    expect(p).toContain(NOT_IN_FILE)
    expect(p).toContain('Do not choose one')
    expect(p).not.toContain('Case diary')
    expect(ASK_PROMPT_VERSION).toBe('case_qa/ask@1')
  })
  it('an answer citing sent pieces is found, with those sources only', () => {
    const c = checkAnswer('It was 21 August [S1]. W1 says 22 August [S2]. Made up [S9].', sent)
    expect(c.kind).toBe('found')
    expect(c.sources.map((s) => s.tag)).toEqual(['S1', 'S2'])
  })
  it('an answer citing nothing that was sent is unsourced', () => {
    expect(checkAnswer('It was on Monday.', sent).kind).toBe('unsourced')
    expect(checkAnswer('It was on Monday [S9].', sent).kind).toBe('unsourced')
  })
  it('the model saying it is not in the file is shown as that, without sources', () => {
    const c = checkAnswer('  not in the file  ', sent)
    expect(c).toEqual({ kind: 'notInFile', text: 'not in the file', sources: [] })
  })
})
