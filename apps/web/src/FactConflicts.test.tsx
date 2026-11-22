// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FactConflicts from './FactConflicts'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const firText = 'On 21 August 2026 the complainant transferred Rs 9,80,000 to the account the caller gave.'
const replyTitle = 'Reply to notice BNSS_94 from Bank of Demo, received 25 Aug 2026'
const passages = [
  { id: 'P1', kind: 'complaint', title: 'FIR complaint', text: firText },
  { id: 'P2', kind: 'statement', title: 'Statement of W1', text: 'Fictional Witness said I paid Rs 9,00,000.' },
  { id: 'P3', kind: 'reply', title: replyTitle, text: 'Debit of Rs 8,90,000 on 21-08-2026.' },
]
const answer = JSON.stringify([
  { kind: 'amount', topic: 'amount of the 21 August transfer', a: { source: 'FIR', value: 'Rs 9,80,000', quote: 'Rs 9,80,000' }, b: { source: 'D1', value: 'Rs 8,90,000', quote: 'Debit of Rs 8,90,000' } },
  { kind: 'amount', topic: 'same amount', a: { source: 'FIR', value: 'Rs 9,80,000', quote: 'Rs 9,80,000' }, b: { source: 'D1', value: '980000', quote: 'Rs 8,90,000' } },
])

type Reply = { status: number; body: unknown }
function stub(opts: { file?: Reply; generate?: Reply; diary?: Reply; decision?: Reply } = {}) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = url.endsWith('case-file') ? (opts.file ?? { status: 200, body: { passages } })
      : url.endsWith('generate') ? (opts.generate ?? { status: 200, body: { request_id: 'r1', draft: answer, provider: 'fake', model: 'm' } })
        : (url.endsWith('decisions') ? opts.decision : opts.diary) ?? { status: 201, body: {} }
    return { ok: r.status < 300, status: r.status, json: async () => r.body }
  }))
  return calls
}
const ask = async () => fireEvent.click(await screen.findByRole('button', { name: "Compare the FIR with the case's documents using AI" }))

test('the case file is read only when asked; a conflict shows both values and sources, and noting it writes the diary and logs the decision', async () => {
  const calls = stub()
  render(<FactConflicts firId="f1" firText={firText} />)
  expect(calls.length).toBe(0)
  await ask()
  expect(await screen.findByText('amount of the 21 August transfer')).toBeTruthy()
  expect(screen.queryByText('same amount')).toBeNull()                    // the quote does not hold the value
  expect(calls[0].url).toBe('/api/firs/f1/case-file')
  const gen = calls.find((c) => c.url === '/ai/v1/generate')!
  expect(gen.body).toMatchObject({ feature: 'fact_conflicts', prompt_version: 'fact_conflicts/values@1', case_ref: 'f1' })
  expect(String(gen.body!.prompt)).not.toContain('Fictional Witness')    // statements are not sent here
  expect(screen.getByText(replyTitle)).toBeTruthy()
  expect(screen.getByText('Rs 8,90,000')).toBeTruthy()
  expect(screen.getAllByText('Rs 9,80,000').length).toBe(2)   // the value and its quote
  fireEvent.click(screen.getByRole('button', { name: 'Note in case diary to confirm' }))
  expect(await screen.findByText('Noted in the case diary.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/api/firs/f1/diary')!.body!.text).toBe(
    `Documents disagree (amount of the 21 August transfer): FIR gives Rs 9,80,000 ("Rs 9,80,000"); ${replyTitle} gives Rs 8,90,000 ("Debit of Rs 8,90,000"). To confirm with the source.`)
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toMatchObject({ request_id: 'r1', decision: 'accepted', feature: 'fact_conflicts', case_ref: 'f1' })
})

test('"Not a conflict" writes nothing to the diary and logs a rejection', async () => {
  const calls = stub()
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  fireEvent.click(await screen.findByRole('button', { name: 'Not a conflict' }))
  expect(await screen.findByText('Set aside; your decision is logged.')).toBeTruthy()
  expect(calls.some((c) => c.url.endsWith('/diary'))).toBe(false)
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toMatchObject({ decision: 'rejected', note: 'not a conflict' })
})

test('without a document to compare nothing is sent to the AI', async () => {
  const calls = stub({ file: { status: 200, body: { passages: passages.slice(0, 2) } } })
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('no reply, money trail'))
  expect(calls.some((c) => c.url.startsWith('/ai/'))).toBe(false)
})

test('too long a prompt is not sent; an unreadable or empty answer says none was found', async () => {
  let calls = stub({ file: { status: 200, body: { passages: [{ kind: 'reply', title: 'R', text: 'x'.repeat(60000) }] } } })
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  expect(await screen.findByText('The FIR and the documents are too long to send together.')).toBeTruthy()
  expect(calls.some((c) => c.url.startsWith('/ai/'))).toBe(false)
  cleanup()
  calls = stub({ generate: { status: 200, body: { request_id: 'r2', draft: 'I cannot tell.', provider: 'fake', model: 'm' } } })
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  expect(await screen.findByText(/found no fact on which two documents/)).toBeTruthy()
  expect(calls.length).toBe(2)
})

test('a refusal of the gateway and a failed diary write are shown, and the conflict stays open', async () => {
  stub({ generate: { status: 403, body: { detail: 'This case protects the victim' } } })
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  expect(await screen.findByText(/This case protects the victim/)).toBeTruthy()
  cleanup()
  stub({ diary: { status: 404, body: { detail: 'Not found' } } })
  render(<FactConflicts firId="f1" firText={firText} />)
  await ask()
  fireEvent.click(await screen.findByRole('button', { name: 'Note in case diary to confirm' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Note in case diary to confirm' })).toBeTruthy()
})
