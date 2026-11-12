// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AskCaseFile from './AskCaseFile'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const passages = [
  { id: 'P1', kind: 'complaint', title: 'FIR complaint', text: 'Fictional complaint. A transfer of Rs 9,80,000 was made on 21 August 2026.' },
  { id: 'P2', kind: 'statement', title: 'Statement of W1, recorded 03 Nov 2026', text: 'I saw the transfer on 22 August 2026.' },
]

type Reply = { status: number; body: unknown }
/** The case file answers GET; the gateway answers by path (generate, decisions); every gateway call is recorded. */
function stub(opts: { file?: Reply; generate?: Reply; decision?: Reply } = {}) {
  const calls: { url: string; body: { prompt?: string; decision?: string; [k: string]: unknown } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/ai')) {
      calls.push({ url, body: JSON.parse(init!.body as string) })
      const r = (url.endsWith('generate') ? opts.generate : opts.decision) ?? { status: 200, body: {} }
      return { ok: r.status < 300, status: r.status, json: async () => r.body }
    }
    const r = opts.file ?? { status: 200, body: { passages } }
    return { ok: r.status < 300, status: r.status, json: async () => r.body }
  }))
  return calls
}
const draft = (text: string) => ({ status: 200, body: { request_id: 'r1', draft: text, provider: 'fake', model: 'm', label: 'AI draft - check before use' } })
const ask = async (q: string) => {
  fireEvent.change(await screen.findByLabelText(/Your question/), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}

test('a question with matching passages sends only those, shows the answer with exactly the sources it cites, and logs the verdict', async () => {
  const calls = stub({ generate: draft('The transfer was on 21 August [S1]. W1 says 22 August [S2].') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  expect(await screen.findByText(/The transfer was on 21 August/)).toBeTruthy()
  expect(screen.getByText('AI draft · check each source')).toBeTruthy()
  expect(screen.getByText('FIR complaint')).toBeTruthy()
  expect(screen.getByText('Statement of W1, recorded 03 Nov 2026')).toBeTruthy()
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe('/ai/v1/generate')
  expect(calls[0].body).toMatchObject({ feature: 'case_qa', prompt_version: 'case_qa/ask@1', case_ref: 'f1' })
  expect(calls[0].body.prompt).toContain('] FIR complaint: ')
  expect(calls[0].body.prompt).toContain('[S1] Statement of W1')   // the shorter piece first when both match alike (BM25)
  expect((screen.getByLabelText(/Your question/) as HTMLInputElement).value).toBe('')

  fireEvent.click(screen.getByRole('button', { name: 'Useful' }))
  expect(await screen.findByText('Your verdict (useful) is logged.')).toBeTruthy()
  expect(calls[1]).toEqual({ url: '/ai/v1/decisions', body: { request_id: 'r1', decision: 'accepted', feature: 'case_qa', case_ref: 'f1' } })
})

test('"wrong or not supported" logs a rejection', async () => {
  const calls = stub({ generate: draft('It was 21 August [S1].') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  fireEvent.click(await screen.findByRole('button', { name: 'Wrong or not supported' }))
  expect(await screen.findByText('Your verdict (wrong or not supported) is logged.')).toBeTruthy()
  expect(calls[1].body.decision).toBe('rejected')
})

test('a question about guilt, truth or the future is refused with the reason and nothing is sent', async () => {
  const calls = stub()
  render(<AskCaseFile firId="f1" />)
  await ask('Is the accused guilty?')
  expect(await screen.findByText(/does not say who is guilty or innocent/)).toBeTruthy()
  await ask('Is the witness lying?')
  expect(await screen.findByText(/does not judge whether anyone is telling the truth/)).toBeTruthy()
  await ask('Will he abscond?')
  expect(await screen.findByText(/does not predict what anyone will do/)).toBeTruthy()
  expect(calls).toHaveLength(0)
})

test('nothing in the file matches: "not in the file", no AI call', async () => {
  const calls = stub()
  render(<AskCaseFile firId="f1" />)
  await ask('What colour was the car?')
  expect(await screen.findByText('No passage of this case mentions what you asked. Nothing was sent to the AI.')).toBeTruthy()
  expect(screen.getByText('Not in the file')).toBeTruthy()
  expect(calls).toHaveLength(0)
})

test('the AI saying it is not in the file is shown so; an answer citing no source is marked', async () => {
  stub({ generate: draft('NOT IN THE FILE') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  expect(await screen.findByText('NOT IN THE FILE')).toBeTruthy()
  expect(screen.getByText('Not in the file')).toBeTruthy()
  expect(screen.queryByText('Where this comes from')).toBeNull()
  cleanup()
  stub({ generate: draft('It was on a Monday.') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  expect(await screen.findByText('No source given: do not rely on this')).toBeTruthy()
  expect(screen.queryByText('Where this comes from')).toBeNull()
})

test('a gateway refusal is shown and the question stays for another try; a failed verdict is shown too', async () => {
  stub({ generate: { status: 403, body: { detail: 'cloud refused' } } })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  expect((await screen.findByRole('alert')).textContent).toContain('cloud refused')
  expect((screen.getByLabelText(/Your question/) as HTMLInputElement).value).toBe('When was the transfer?')
  cleanup()
  stub({ generate: draft('On 21 August [S1].'), decision: { status: 500, body: {} } })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  fireEvent.click(await screen.findByRole('button', { name: 'Useful' }))
  expect((await screen.findByRole('alert')).textContent).toContain('The AI gateway answered 500')
  expect(screen.getByRole('button', { name: 'Useful' })).toBeTruthy()
})

test('a too short question is not asked; a case file that cannot be read says so; loading shows first', async () => {
  const calls = stub()
  render(<AskCaseFile firId="f1" />)
  expect(screen.getByText('Loading…')).toBeTruthy()
  fireEvent.change(await screen.findByLabelText(/Your question/), { target: { value: 'ab' } })
  expect((screen.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.submit(screen.getByRole('button', { name: 'Ask' }).closest('form')!)
  expect(calls).toHaveLength(0)
  cleanup()
  stub({ file: { status: 404, body: { error: 'not found' } } })
  render(<AskCaseFile firId="f1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('The server answered 404')
})

test('while the AI answers the button says so and a second question is not sent', async () => {
  let release: (r: unknown) => void = () => undefined
  const calls: unknown[] = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (!url.startsWith('/ai')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ passages }) })
    calls.push(url)
    return new Promise((res) => { release = res })
  }))
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  expect(await screen.findByRole('button', { name: 'Asking…' })).toBeTruthy()
  fireEvent.submit(screen.getByRole('button', { name: 'Asking…' }).closest('form')!)
  expect(calls).toHaveLength(1)
  release({ ok: true, status: 200, json: async () => ({ request_id: 'r', draft: 'On 21 August [S1].', provider: 'fake', model: 'm' }) })
  expect(await screen.findByText(/On 21 August/)).toBeTruthy()
})

test('a verdict marks only its own answer when several questions are on the screen', async () => {
  stub({ generate: draft('On 21 August [S1].') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  await screen.findByText(/On 21 August/)
  await ask('What did W1 say about the transfer?')
  await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Useful' })).toHaveLength(2))
  fireEvent.click(screen.getAllByRole('button', { name: 'Useful' })[1])   // the older answer is lower
  expect(await screen.findByText('Your verdict (useful) is logged.')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Useful' })).toHaveLength(1)
})
