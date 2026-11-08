// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import FactCheck from './FactCheck'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const TEXT = 'On 28 October 2026 a caller said he was from my bank. After I shared a code, Rs 40,000 went out of my account by UPI to fictional@okdemo.'
const LIST = [
  { kind: 'date', value: '28 October 2026', quote: 'On 28 October 2026' },
  { kind: 'amount', value: 'Rs 40,000', quote: 'Rs 40,000 went out' },
  { kind: 'upi', value: 'fictional@okdemo', quote: 'to fictional@okdemo' },
  { kind: 'phone', value: '9800000000', quote: 'a caller said' },
]
const kept = { id: 'k1', kind: 'amount', value: 'Rs 40,000', ai_value: 'Rs 40,000', corrected: false, quote: 'Rs 40,000 went out', confirmed_at: '2026-11-08T10:00:00Z', confirmed_by_name: 'SI Fictional' }

type Reply = { status: number; body: unknown }
function stub(opts: { facts?: Reply; save?: Reply; generate?: Reply; decision?: Reply } = {}) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = url.endsWith('generate') ? opts.generate : url.endsWith('decisions') ? opts.decision : method === 'POST' ? opts.save : opts.facts
    const reply = r ?? { status: method === 'POST' ? 201 : 200, body: method === 'POST' ? { id: 'n1' } : [] }
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }
  }))
  return calls
}
const draft = (text: string) => ({ status: 200, body: { request_id: 'r1', draft: text, provider: 'fake', model: 'm', label: 'AI draft - check before use' } })
const card = (name: string) => screen.getByRole('listitem', { name })

test('the AI facts that point at the text are shown in place; confirming one keeps it with its quote, and the decision is logged', async () => {
  const calls = stub({ generate: draft('```json\n' + JSON.stringify(LIST) + '\n```') })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  expect(await screen.findByText('No fact of this FIR is confirmed yet.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Find facts with AI' }))
  expect(await screen.findByText('AI draft · check each fact')).toBeTruthy()
  const gen = calls.find((c) => c.url === '/ai/v1/generate')!
  expect(gen.body).toMatchObject({ feature: 'fir_extract', prompt_version: 'fir_extract/facts@1', case_ref: 'f1', max_tokens: 1500 })
  expect(String(gen.body!.prompt)).toContain(TEXT)
  // the phone number is not in its quote: dropped and counted; the kinds with nothing are listed
  expect(screen.getByText('1 answers of the AI did not point at words of the FIR text and are not shown.')).toBeTruthy()
  expect(screen.getByText('The AI found nothing of these kinds: Time, Place, UTR (bank reference), Phone number, Bank account. It did not guess; read the text for them yourself.')).toBeTruthy()
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(within(card('Amount: Rs 40,000')).getByText('Rs 40,000 went out').tagName).toBe('MARK')
  // the date is corrected to the form the officer wants, then confirmed
  fireEvent.change(within(card('Date: 28 October 2026')).getByLabelText('Value'), { target: { value: '2026-10-28' } })
  fireEvent.click(within(card('Date: 28 October 2026')).getByRole('button', { name: 'Confirm' }))
  expect(await within(card('Date: 28 October 2026')).findByText('Confirmed')).toBeTruthy()
  const save = calls.find((c) => c.method === 'POST' && c.url === '/api/firs/f1/facts')!
  expect(save.body).toEqual({ kind: 'date', value: '2026-10-28', aiValue: '28 October 2026', quote: 'On 28 October 2026', aiRequestId: 'r1' })
  expect(calls.filter((c) => c.url === '/api/firs/f1/facts' && c.method === 'GET')).toHaveLength(2)   // the list is read again
  fireEvent.click(within(card('UPI id: fictional@okdemo')).getByRole('button', { name: 'Wrong' }))
  expect(within(card('UPI id: fictional@okdemo')).getByText('Marked wrong')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect(await screen.findByText('Your decision (partly kept or corrected) is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toEqual({ request_id: 'r1', decision: 'edited', feature: 'fir_extract', case_ref: 'f1', note: '1 confirmed (1 corrected), 1 wrong, 1 left open' })
  expect(within(card('Amount: Rs 40,000')).getByRole('button', { name: 'Confirm' })).toHaveProperty('disabled', true)
})

test('every fact confirmed unchanged is accepted; none confirmed is rejected', async () => {
  let calls = stub({ generate: draft(JSON.stringify(LIST.slice(1, 2))) })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
  await screen.findByText('Confirmed')
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect(await screen.findByText('Your decision (all kept) is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body!.decision).toBe('accepted')
  cleanup()
  calls = stub({ generate: draft(JSON.stringify(LIST.slice(1, 2))) })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Wrong' }))
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect(await screen.findByText('Your decision (rejected) is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body!.note).toBe('0 confirmed (0 corrected), 1 wrong, 0 left open')
})

test('confirmed facts are listed with their source and who confirmed them; a corrected one shows what the AI read', async () => {
  stub({ facts: { status: 200, body: [kept, { ...kept, id: 'k2', kind: 'date', value: '2026-10-28', ai_value: '28 October 2026', corrected: true, quote: 'On 28 October 2026' }] } })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  expect(await screen.findByText('Rs 40,000')).toBeTruthy()
  expect(screen.getByText('(corrected; the AI read 28 October 2026)')).toBeTruthy()
  expect(screen.getAllByText(/confirmed by SI Fictional/)).toHaveLength(2)
  expect(screen.getByText('Rs 40,000 went out').tagName).toBe('Q')
})

test('an unreadable answer, an answer with no fact and the refusals of the servers are shown; nothing is kept', async () => {
  let calls = stub({ generate: draft('[demo draft] Read the FIR text below') })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  expect(await screen.findByText("The AI's answer could not be read as a list of facts. Nothing was kept.")).toBeTruthy()
  expect(calls.some((c) => c.method === 'POST' && c.url.startsWith('/api'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))   // an unreadable draft is a rejected one
  expect(await screen.findByText('Your decision (rejected) is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body!.note).toBe('0 confirmed (0 corrected), 0 wrong, 0 left open')
  cleanup()
  stub({ generate: draft('[]') })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  expect(await screen.findByText('The AI found no fact that points at words of the FIR text.')).toBeTruthy()
  cleanup()
  stub({ generate: { status: 403, body: { detail: 'Your unit keeps case text on the state servers' } } })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The AI gateway answered 403: Your unit keeps case text on the state servers')
  cleanup()
  calls = stub({ generate: draft(JSON.stringify(LIST.slice(1, 2))), save: { status: 409, body: { message: 'This fact is already confirmed for this case.' } }, decision: { status: 409, body: { detail: 'a decision on this AI draft is already logged' } } })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This fact is already confirmed for this case.')
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()   // still open
  fireEvent.change(screen.getByLabelText('Value'), { target: { value: '  ' } })
  expect(screen.getByRole('button', { name: 'Confirm' })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The AI gateway answered 409: a decision on this AI draft is already logged')
  expect(calls.filter((c) => c.url === '/ai/v1/decisions')).toHaveLength(1)
})

test('a protected case is not sent to the AI; a failed list read shows its error; an answer of another shape does not crash', async () => {
  const calls = stub()
  render(<FactCheck firId="f1" text={TEXT} victimProtected />)
  expect(await screen.findByText(/not offered on a case that protects the victim's identity/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Find facts with AI' })).toBeNull()
  expect(calls.some((c) => c.url.startsWith('/ai'))).toBe(false)
  cleanup()
  stub({ facts: { status: 500, body: {} } })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  expect((await screen.findByRole('alert')).textContent).toBe('The server answered 500 for /firs/f1/facts')
  cleanup()
  stub({ facts: { status: 200, body: { not: 'a list' } } })
  render(<FactCheck firId="f1" text={TEXT} victimProtected={false} />)
  expect(await screen.findByText('No fact of this FIR is confirmed yet.')).toBeTruthy()
})

test('a fact far into a long text is shown with the words around it, cut with dots on both sides', async () => {
  const long = 'Fictional words. '.repeat(10) + 'Rs 40,000 went out. ' + 'More fictional words. '.repeat(10)
  stub({ generate: draft(JSON.stringify([{ kind: 'amount', value: 'Rs 40,000', quote: 'Rs 40,000' }])) })
  render(<FactCheck firId="f1" text={long} victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  const q = (await screen.findByText('Rs 40,000')).closest('q')!
  expect(q.textContent!.startsWith('…')).toBe(true)
  expect(q.textContent!.endsWith('…')).toBe(true)
  expect(q.textContent!.length).toBeLessThan(120)
})
