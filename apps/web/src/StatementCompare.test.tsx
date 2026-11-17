// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import StatementCompare from './StatementCompare'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const statements = [
  { id: 's1', label: 'W1', name: 'Fictional Son', original_text: 'I sent the money on 23 August after the second call.' },
  { id: 's2', label: null, name: null, original_text: 'The caller asked for the money on the 21st.' },
]
const firText = 'The complainant sent Rs 40,000 on 22 August to the account of the caller.'
const answer = JSON.stringify([
  { topic: 'date of payment', a: { source: 'FIR', quote: 'on 22 August' }, b: { source: 'S1', quote: 'on 23 August' } },
  { topic: 'who asked', a: { source: 'S2', quote: 'on the 21st' }, b: { source: 'S1', quote: 'the second call' } },
])

type Reply = { status: number; body: unknown }
function stub(opts: { generate?: Reply; diary?: Reply; decision?: Reply } = {}) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = (url.endsWith('generate') ? opts.generate : url.endsWith('decisions') ? opts.decision : opts.diary)
      ?? (url.endsWith('generate') ? { status: 200, body: { request_id: 'r1', draft: answer, provider: 'fake', model: 'm' } } : { status: 201, body: {} })
    return { ok: r.status < 300, status: r.status, json: async () => r.body }
  }))
  return calls
}
const ask = async () => fireEvent.click(await screen.findByRole('button', { name: 'Compare the statements with the FIR using AI' }))

test('nothing is offered with fewer than two texts', () => {
  const { container } = render(<StatementCompare firId="f1" firText="" statements={[statements[0]]} />)
  expect(container.innerHTML).toBe('')
})

test('the differences are sent without names, shown with both quotes, and noting one writes the case diary and logs the decision', async () => {
  const calls = stub()
  render(<StatementCompare firId="f1" firText={firText} statements={statements} />)
  await ask()
  expect(await screen.findByText('date of payment')).toBeTruthy()
  const gen = calls.find((c) => c.url === '/ai/v1/generate')!
  expect(gen.body).toMatchObject({ feature: 'statement_compare', prompt_version: 'statement_compare/diff@1', case_ref: 'f1' })
  expect(String(gen.body!.prompt)).not.toContain('Fictional Son')
  expect(screen.getAllByText('W1 · Fictional Son').length).toBe(2)
  expect(screen.getAllByText('S2').length).toBeGreaterThan(0)   // a person without a label or name is shown by id
  fireEvent.click(screen.getAllByRole('button', { name: 'Note in case diary' })[0])
  expect(await screen.findByText('Noted in the case diary.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/api/firs/f1/diary')!.body!.text).toBe('Difference to clarify (date of payment): FIR says "on 22 August"; W1 · Fictional Son says "on 23 August".')
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toMatchObject({ request_id: 'r1', decision: 'accepted', feature: 'statement_compare', case_ref: 'f1' })
})

test('"Not a difference" writes nothing to the diary and logs a rejection', async () => {
  const calls = stub()
  render(<StatementCompare firId="f1" firText={firText} statements={statements} />)
  await ask()
  fireEvent.click((await screen.findAllByRole('button', { name: 'Not a difference' }))[1])
  expect(await screen.findByText('Set aside; your decision is logged.')).toBeTruthy()
  expect(calls.some((c) => c.url.endsWith('/diary'))).toBe(false)
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toMatchObject({ decision: 'rejected' })
})

test('an answer with no usable difference says so; nothing is kept', async () => {
  stub({ generate: { status: 200, body: { request_id: 'r1', draft: 'not a list', provider: 'fake', model: 'm' } } })
  render(<StatementCompare firId="f1" firText={firText} statements={statements} />)
  await ask()
  expect(await screen.findByText('The AI found no difference it could quote from two sources.')).toBeTruthy()
})

test('texts too long to send together are not sent; a refusal of the gateway is shown', async () => {
  const calls = stub()
  render(<StatementCompare firId="f1" firText={'x'.repeat(59000)} statements={statements} />)
  await ask()
  expect((await screen.findByRole('alert')).textContent).toBe('The FIR and statements are too long to send together.')
  expect(calls.length).toBe(0)
  cleanup()
  stub({ generate: { status: 403, body: { detail: 'Refused on a protected case' } } })
  render(<StatementCompare firId="f1" firText={firText} statements={statements} />)
  await ask()
  expect((await screen.findByRole('alert')).textContent).toContain('Refused')
})

test('a failed diary entry or decision is shown and the difference stays open', async () => {
  stub({ diary: { status: 400, body: { message: 'Diary closed' } } })
  render(<StatementCompare firId="f1" firText={firText} statements={statements} />)
  await ask()
  fireEvent.click((await screen.findAllByRole('button', { name: 'Note in case diary' }))[0])
  expect((await screen.findByRole('alert')).textContent).toContain('Diary closed')
  expect(screen.getAllByRole('button', { name: 'Note in case diary' }).length).toBe(2)
})
