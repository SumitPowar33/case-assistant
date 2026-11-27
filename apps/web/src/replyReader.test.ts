import { expect, test } from 'vitest'
import { readReply, REPLY_PROMPT_VERSION, replyPrompt } from './replyReader'

// Fictional data only.
const REPLY = 'Dear Sir, the account statement for 01-09-2026 to 30-09-2026 is attached. KYC will follow by post.\nCertificate under section 63(4) BSA, Part A and Part B, signed by the Nodal Officer.'
const ITEMS = ['Account statement', 'KYC documents']

test('the prompt lists the items, wraps the reply, asks for the certificate only when told to, and judges nobody', () => {
  const p = replyPrompt(ITEMS, REPLY, true)
  expect(p).toContain('- Account statement\n- KYC documents')
  expect(p).toContain(`<<<\n${REPLY}\n>>>`)
  expect(p).toContain('"certificate"')
  expect(p).toMatch(/Do not say whether anyone is guilty/)
  expect(replyPrompt(ITEMS, REPLY, false)).not.toContain('"certificate"')
})

test('an item counts as present only when its quote is words of the reply', () => {
  const answer = JSON.stringify([
    { item: 'Account statement', present: true, quote: 'account statement for 01-09-2026 to 30-09-2026 is attached' },
    { item: 'kyc documents', present: true, quote: 'KYC documents are enclosed' },   // invented words: not in the reply
    { item: 'certificate', present: true, quote: 'Certificate under section 63(4) BSA, Part A and Part B' },
  ])
  expect(readReply(answer, ITEMS, REPLY, true)).toEqual({ kind: 'read', items: [
    { item: 'Account statement', present: true, quote: 'account statement for 01-09-2026 to 30-09-2026 is attached' },
    { item: 'KYC documents', present: false, quote: '' },
  ], certificate: { present: true, quote: 'Certificate under section 63(4) BSA, Part A and Part B' } })
})

test('a missing entry, present false, an empty or oversized quote and a non-object entry all mean not found', () => {
  const answer = `Here it is:\n\`\`\`json\n${JSON.stringify([
    { item: 'Account statement', present: false, quote: 'account statement' },
    { item: 'KYC documents', present: true, quote: '' },
    { item: 'certificate', present: true, quote: 'x'.repeat(501) },
    'text', null,
  ])}\n\`\`\``
  const r = readReply(answer, ITEMS, REPLY, true)
  expect(r).toEqual({ kind: 'read', items: [
    { item: 'Account statement', present: false, quote: '' }, { item: 'KYC documents', present: false, quote: '' },
  ], certificate: { present: false, quote: '' } })
})

test('a certificate entry is ignored when it was not asked for; an answer that is not a list is unreadable', () => {
  const answer = JSON.stringify([{ item: 'certificate', present: true, quote: 'Part A and Part B' }])
  expect(readReply(answer, ITEMS, REPLY, false)).toMatchObject({ certificate: null })
  expect(readReply('No idea.', ITEMS, REPLY, true)).toEqual({ kind: 'unreadable' })
})

test('the prompt text is pinned to its version, with no empty line when no certificate is asked for', () => {
  expect([REPLY_PROMPT_VERSION, replyPrompt(['Account statement'], 'Fictional reply.', false)]).toMatchInlineSnapshot(`
    [
      "reply_check/reply@1",
      "A police notice asked a bank or telecom company for the items below. Read its reply and say, for each item, whether the reply brings it.
    Answer with only a JSON list. Each entry is an object with "item" (the item exactly as listed), "present" (true or false) and "quote" (the words of the reply that bring it, copied exactly, character for character, at most 300 characters; empty when not present).
    Rules: say present only when the reply itself holds the item (not a promise to send it later). Never guess. Do not say whether anyone is guilty or whether the reply is true.
    Items asked for:
    - Account statement
    Reply:
    <<<
    Fictional reply.
    >>>",
    ]
  `)
})

test('item names match without outer spaces or case, odd entries are ignored, and a quote may be exactly 500 characters', () => {
  const long = 'x'.repeat(500)
  const answer = JSON.stringify([
    { item: 5, present: true, quote: 'is attached' },
    { item: '  account STATEMENT ', present: true, quote: long },
    { item: 'KYC documents', present: true, quote: 7 },
  ])
  const r = readReply(answer, [' Account statement ', 'KYC documents'], `${long} is attached`, false)
  expect(r).toEqual({ kind: 'read', certificate: null, items: [{ item: ' Account statement ', present: true, quote: long }, { item: 'KYC documents', present: false, quote: '' }] })
  const over = readReply(JSON.stringify([{ item: 'Account statement', present: true, quote: `Dear${' '.repeat(600)}Sir` }]), ['Account statement'], 'Dear Sir', false)
  expect(over).toMatchObject({ items: [{ present: false }] })
})
