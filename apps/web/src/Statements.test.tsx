// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Statements from './Statements'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const data = {
  witnesses: [
    { person_id: 'p1', role: 'witness', label: 'W1', name: 'Fictional Son', statements: 1 },
    { person_id: 'p2', role: 'witness', label: 'W2', name: 'Fictional Nodal Officer', statements: 0 },
  ],
  statements: [{ id: 's1', person_id: 'p1', label: 'W1', name: 'Fictional Son', recorded_at: '2026-11-02T04:30:00Z', recorded_by_name: 'SI Fictional', language: 'mr', medium: 'video', original_text: 'बाबा व्हिडिओ कॉलवर होते.' }],
}

function stub(write: { status: number; body: unknown } = { status: 201, body: {} }, load: unknown = data) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => write.body }
    return { ok: true, status: 200, json: async () => load }
  }))
  return calls
}

test('the tracker shows who is recorded, the statement is shown as said, and a new one is sent for the chosen person', async () => {
  const calls = stub()
  render(<Statements firId="f1" />)
  expect(await screen.findByText('बाबा व्हिडिओ कॉलवर होते.')).toBeTruthy()
  expect(screen.getByText('Recorded')).toBeTruthy()
  expect(screen.getByText('Not recorded')).toBeTruthy()
  expect(screen.getByText('MR')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Who made the statement'), { target: { value: 'p2' } })
  fireEvent.change(screen.getByLabelText('How it was recorded'), { target: { value: 'audio' } })
  fireEvent.change(screen.getByLabelText('The statement, in the words and language spoken'), { target: { value: 'The bank records were sent on 22 August.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/firs/f1/statements', body: { personId: 'p2', language: 'en', medium: 'audio', text: 'The bank records were sent on 22 August.' } })
})

test('the first person is chosen when nobody is picked, and a refusal from the server is shown', async () => {
  const calls = stub({ status: 400, body: { message: 'A statement is recorded for a complainant, victim or witness of this case.' } })
  render(<Statements firId="f1" />)
  await screen.findByText('Witness tracker')
  fireEvent.change(screen.getByLabelText('The statement, in the words and language spoken'), { target: { value: 'Words of the first witness' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ personId: 'p1', medium: 'written' })
})

test('with no witnesses there is no form, only a pointer to People; an empty answer breaks nothing', async () => {
  stub(undefined, { witnesses: [], statements: [] })
  render(<Statements firId="f1" />)
  expect(await screen.findByText(/Add them under People first/)).toBeTruthy()
  expect(screen.getByText('No statement has been recorded yet.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save statement' })).toBeNull()
  cleanup()
  stub(undefined, {})
  render(<Statements firId="f1" />)
  expect(await screen.findByText('Witness tracker')).toBeTruthy()
})

test('a failed load is shown', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ message: 'No such case' }) })))
  render(<Statements firId="f1" />)
  expect(await screen.findByRole('alert')).toBeTruthy()
})

// AI translation beside a statement (A3)
type Reply = { status: number; body: unknown }
function stubAi(opts: { generate?: Reply; save?: Reply; decision?: Reply; load?: unknown } = {}) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = url.endsWith('generate') ? opts.generate : url.endsWith('decisions') ? opts.decision : method === 'POST' ? opts.save : { status: 200, body: opts.load ?? data }
    const reply = r ?? { status: method === 'POST' ? 201 : 200, body: { id: 'n1' } }
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }
  }))
  return calls
}
const draft = (text: string) => ({ status: 200, body: { request_id: 'r1', draft: text, provider: 'fake', model: 'm' } })
const withStatement = (s: Record<string, unknown>) => ({ ...data, statements: [{ ...data.statements[0], masked: false, translated_text: null, translation_corrected: null, translation_checked_at: null, translation_checked_by_name: null, ...s }] })
const marathi = withStatement({ original_text: 'मी २८ तारखेला ४०,००० रुपये पाठवले.' })

test('the AI draft of a translation is checked, corrected and saved beside the original; the decision is logged', async () => {
  const calls = stubAi({ generate: draft('I sent Rs 4,000 on the 28th.'), load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  expect(await screen.findByText('AI draft · read it against the original')).toBeTruthy()
  const gen = calls.find((c) => c.url === '/ai/v1/generate')!
  expect(gen.body).toMatchObject({ feature: 'statement_translate', prompt_version: 'statement_translate/en@1', case_ref: 'f1' })
  expect(String(gen.body!.prompt)).toContain('मी २८ तारखेला ४०,००० रुपये पाठवले.')
  expect(String(gen.body!.prompt)).toContain('from Marathi into English')
  expect(screen.getByText('Numbers of the original not in the draft: 40000. Check them before saving.')).toBeTruthy()
  // the original stays on the card as said
  expect(screen.getByText('मी २८ तारखेला ४०,००० रुपये पाठवले.')).toBeTruthy()
  const box = screen.getByLabelText(/English translation \(correct it/)
  expect((box as HTMLTextAreaElement).value).toBe('I sent Rs 4,000 on the 28th.')
  fireEvent.change(box, { target: { value: 'I sent Rs 40,000 on the 28th.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save as checked' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('decisions'))).toBe(true))
  expect(calls.find((c) => c.url === '/api/firs/f1/statements/s1/translation')!.body).toEqual({ text: 'I sent Rs 40,000 on the 28th.', aiText: 'I sent Rs 4,000 on the 28th.', aiRequestId: 'r1' })
  expect(calls.find((c) => c.url.endsWith('decisions'))!.body).toMatchObject({ request_id: 'r1', decision: 'edited', feature: 'statement_translate', case_ref: 'f1', note: 'translation saved (corrected)' })
  await vi.waitFor(() => expect(calls.filter((c) => c.url === '/api/firs/f1/statements').length).toBe(2))   // read again
})

test('a draft saved unchanged is logged as accepted; a rejected one as rejected and nothing is saved', async () => {
  let calls = stubAi({ generate: draft('I sent Rs 40,000 on the 28th.'), load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  expect(await screen.findByText('AI draft · read it against the original')).toBeTruthy()
  expect(screen.queryByText(/Numbers of the original not in the draft/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save as checked' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('decisions'))).toBe(true))
  expect(calls.find((c) => c.url.endsWith('decisions'))!.body).toMatchObject({ decision: 'accepted', note: 'translation saved (as drafted)' })
  cleanup()
  calls = stubAi({ generate: draft('Something else'), load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
  expect(await screen.findByText('The draft was rejected; your decision is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('decisions'))!.body).toMatchObject({ decision: 'rejected', note: 'translation rejected' })
  expect(calls.some((c) => c.url.endsWith('/translation'))).toBe(false)
  expect(screen.getByRole('button', { name: 'Translate into English with AI' })).toBeTruthy()   // may ask again
})

test('an empty answer can only be rejected; a refused request, save or decision is shown', async () => {
  let calls = stubAi({ generate: draft('  '), load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  expect(await screen.findByText('The AI gave no translation. Nothing was kept.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save as checked' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('decisions'))).toBe(true))
  cleanup()
  stubAi({ generate: { status: 429, body: { detail: 'Too many drafts' } }, load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  cleanup()
  calls = stubAi({ generate: draft('I sent Rs 40,000 on the 28th.'), save: { status: 409, body: { message: 'This statement already has a checked translation.' } }, load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save as checked' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This statement already has a checked translation.')
  expect(calls.some((c) => c.url.endsWith('decisions'))).toBe(false)
  cleanup()
  stubAi({ generate: draft('x'), decision: { status: 500, body: { detail: 'gateway down' } }, load: marathi })
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a checked translation is shown under the original; English, protected and masked statements offer no AI', async () => {
  stubAi({ load: withStatement({ translated_text: 'Father was on a video call.', translation_corrected: true, translation_checked_at: '2026-11-08T10:00:00Z', translation_checked_by_name: 'SI Fictional' }) })
  render(<Statements firId="f1" />)
  expect(await screen.findByText('Father was on a video call.')).toBeTruthy()
  expect(screen.getByText('English translation, checked')).toBeTruthy()
  expect(screen.getByText(/checked against the original by SI Fictional/).textContent).toContain('corrected from the AI draft')
  expect(screen.getByText('बाबा व्हिडिओ कॉलवर होते.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Translate into English with AI' })).toBeNull()
  cleanup()
  stubAi({ load: withStatement({ translated_text: 'Father was on a video call.', translation_corrected: false, translation_checked_at: '2026-11-08T10:00:00Z', translation_checked_by_name: 'SI Fictional' }) })
  render(<Statements firId="f1" />)
  expect((await screen.findByText(/checked against the original by SI Fictional/)).textContent).not.toContain('corrected')
  cleanup()
  stubAi({ load: withStatement({ language: 'en', original_text: 'In English.' }) })
  render(<Statements firId="f1" />)
  expect(await screen.findByText('In English.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Translate into English with AI' })).toBeNull()
  expect(screen.queryByText(/No AI translation/)).toBeNull()
  cleanup()
  stubAi({ load: marathi })
  render(<Statements firId="f1" victimProtected />)
  expect(await screen.findByText(/No AI translation for this statement/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Translate into English with AI' })).toBeNull()
  cleanup()
  stubAi({ load: withStatement({ masked: true }) })
  render(<Statements firId="f1" />)
  expect(await screen.findByText(/No AI translation for this statement/)).toBeTruthy()
})
