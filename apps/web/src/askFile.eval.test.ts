// The evaluation set of "Ask the case file" (plan section 9, flaw 8): one fictional case file and fixed questions with the
// pieces that hold their answers. It checks retrieval, the part the app does itself: the piece with the answer must be among
// the first three sent to the AI; when two pieces disagree both must be sent (flaw 6); a question the file has no words for
// sends nothing, so the screen says "not in the file" without an AI call (flaw 4). A change to the ranking that loses an
// answer fails here. The AI's own answers are not judged here (that needs a provider; see PROGRESS.md). Fictional data only.
import { describe, expect, it } from 'vitest'
import { retrieve, type Passage } from './askFile'

const FILE: Passage[] = [
  { id: 'P1', kind: 'complaint', title: 'FIR complaint', text: [
    'I am a retired fictional teacher living at Fictional Nagar.',
    'On 21 August 2026 at about 11 am a caller said he was from the bank and that my bank account would be blocked.',
    'He asked for the code sent to my phone. After I gave it, Rs 9,80,000 went out of my bank account in three transfers.',
    'The caller used the number 90000 00001.',
  ].join('\n') },
  { id: 'P2', kind: 'statement', title: 'Statement of W1, recorded 03 Nov 2026', text: 'I am the son of the complainant. My father told me about the call on 22 August 2026 in the evening. He was afraid and did not want to go to the bank.' },
  { id: 'P3', kind: 'statement', title: 'Statement of W2, recorded 04 Nov 2026', text: 'मी बँकेत रोखपाल आहे. २१ ऑगस्टला खात्यातून पैसे गेले.' },
  { id: 'P4', kind: 'translation', title: 'English translation of the statement of W2, recorded 04 Nov 2026', text: 'I am a cashier at the bank. On 21 August money went out of the account.' },
  { id: 'P5', kind: 'diary', title: 'Case diary, 05 Nov 2026', text: 'Visited the bank branch. The branch manager gave the account statement. CCTV footage of the branch for 21 August was asked for.' },
  { id: 'P6', kind: 'diary', title: 'Case diary, 07 Nov 2026', text: 'The telecom company replied that the number 90000 00001 was issued on a fictional identity in another district.' },
  { id: 'P7', kind: 'evidence', title: 'Evidence E1', text: 'Bank statement of the complainant showing three debits on 21 August 2026 to account XXXX4471.' },
  { id: 'P8', kind: 'evidence', title: 'Evidence E2', text: 'Pen drive with the CCTV footage of the bank branch, sealed.' },
  { id: 'P9', kind: 'notice', title: 'Notice BNSS 94 to Fictional Bank (replied)', text: 'Give the account holder details, KYC and the statement of account XXXX4471 from 1 August 2026, with the BSA 63(4) certificate.' },
]

// question, the piece(s) that must be among the first three
const FOUND: [string, string[]][] = [
  ['How much money went out?', ['P1']],
  ['Which phone number did the caller use?', ['P1', 'P6']],
  ['Who was the number 90000 00001 issued to?', ['P6']],
  ['Which account received the debits?', ['P7']],
  ['What was asked from the bank in the notice?', ['P9']],
  ['Is there CCTV footage?', ['P5', 'P8']],
  ['What did the cashier say?', ['P4']],
  ['What did the son say?', ['P2']],
  ['When did the manager give the account statement?', ['P5']],
  ['What did the telecom company reply?', ['P6']],
  ['Was the KYC asked for?', ['P9']],
  ['How many transfers were made?', ['P1']],
]

describe('the evaluation set of Ask the case file', () => {
  it.each(FOUND)('%s: the answer is among the first three pieces sent', (question, expected) => {
    const sent = retrieve(question, FILE).slice(0, 3).map((s) => s.title)
    for (const id of expected) {
      const title = FILE.find((p) => p.id === id)!.title
      expect(sent.some((t) => t === title || t.startsWith(`${title}, `)), `${question} -> ${sent.join(' | ')}`).toBe(true)
    }
  })

  it('when the complaint and a statement disagree on the date of the call, both are sent (never one chosen)', () => {
    const sent = retrieve('When was the call?', FILE).map((s) => s.title)
    expect(sent.some((t) => t.startsWith('FIR complaint'))).toBe(true)
    expect(sent).toContain('Statement of W1, recorded 03 Nov 2026')
  })

  it('a checked English translation lets an English question find a statement made in Marathi', () => {
    expect(retrieve('What did the cashier say about 21 August?', FILE)[0].title).toBe('English translation of the statement of W2, recorded 04 Nov 2026')
  })

  it.each(['Who owns the red motorcycle?', 'What did the doctor write in the medical report?', 'Was a lookout circular prepared?'])(
    '%s: the file has no words for it, so nothing is sent and the screen says "not in the file"', (question) => {
      expect(retrieve(question, FILE)).toEqual([])
    })

  it('a question whose answer is absent but shares a word with the file still sends that piece: the AI must then say "not in the file"', () => {
    // a limit of word matching: "issued" is in the telecom reply, which says nothing of a lookout circular (the prompt's rule and
    // checkAnswer's NOT_IN_FILE handle it; see askFile.test.ts)
    expect(retrieve('Was a lookout circular issued?', FILE).map((s) => s.title)).toEqual(['Case diary, 07 Nov 2026'])
  })

  it('every answer piece names where it is: the passage and, for a passage of several lines, the lines', () => {
    const top = retrieve('Which phone number did the caller use?', FILE)
    expect(top.map((s) => s.title)).toContain('FIR complaint, lines 1-4')
  })
})
