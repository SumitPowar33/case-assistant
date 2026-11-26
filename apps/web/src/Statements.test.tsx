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
  statements: [{ id: 's1', person_id: 'p1', label: 'W1', name: 'Fictional Son', recorded_at: '2026-11-02T04:30:00Z', recorded_by_name: 'SI Fictional', language: 'mr', medium: 'video', original_text: 'बाबा व्हिडिओ कॉलवर होते.', from_recording: false }],
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

test('differences to clarify are offered with the FIR text and a masked person\'s statement is left out; a protected case has none', async () => {
  const two = { ...data, statements: [
    { ...data.statements[0], masked: false, translated_text: 'x', translation_corrected: null, translation_checked_at: null, translation_checked_by_name: null },
    { ...data.statements[0], id: 's2', masked: true, translated_text: null, translation_corrected: null, translation_checked_at: null, translation_checked_by_name: null, original_text: 'masked words' },
  ] }
  const calls = stubAi({ load: two, generate: draft('[]') })
  render(<Statements firId="f1" firText="The FIR text of a fictional case." />)
  fireEvent.click(await screen.findByRole('button', { name: 'Compare the statements with the FIR using AI' }))
  expect(await screen.findByText('The AI found no difference it could quote from two sources.')).toBeTruthy()
  const prompt = String(calls.find((c) => c.url === '/ai/v1/generate')!.body!.prompt)
  expect(prompt).toContain('The FIR text of a fictional case.')
  expect(prompt).not.toContain('masked words')
  cleanup()
  stubAi({ load: two })
  render(<Statements firId="f1" firText="The FIR text of a fictional case." victimProtected />)
  await screen.findByText('Witness tracker')
  expect(screen.queryByRole('button', { name: 'Compare the statements with the FIR using AI' })).toBeNull()
})

test('a recording is written down as a draft, corrected, saved, and the decision is logged; a discarded draft is logged as rejected', async () => {
  const calls: { url: string; method: string; body?: unknown }[] = []
  let transcribed = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body instanceof Blob ? 'RECORDING' : init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, method: init?.method ?? 'GET', body })
    if (url.startsWith('/ai/v1/transcribe')) return { ok: true, status: 200, json: async () => ({ request_id: `r${++transcribed}`, text: 'I was at home at nine.' }) }
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => data }
  }))
  render(<Statements firId="f1" />)
  await screen.findByText('बाबा व्हिडिओ कॉलवर होते.')
  expect(screen.queryByLabelText(/Write down a recording/)).toBeNull()   // only for a recording
  fireEvent.change(screen.getByLabelText('How it was recorded'), { target: { value: 'audio' } })
  expect(screen.getByText(/nothing is sent to a cloud service/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['x'], 'a.m4a', { type: 'audio/mp4' })] } })
  await screen.findByText(/A draft was written down/)
  expect(calls.find((c) => c.url.startsWith('/ai/v1/transcribe'))).toMatchObject({ url: '/ai/v1/transcribe?case_ref=f1&language=en', method: 'POST', body: 'RECORDING' })
  const field = screen.getByLabelText('The statement, in the words and language spoken') as HTMLTextAreaElement
  expect(field.value).toBe('I was at home at nine.')
  fireEvent.change(field, { target: { value: 'I was at home at nine in the evening.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/ai/v1/decisions')).toBe(true))
  expect(calls.find((c) => c.url === '/api/firs/f1/statements' && c.method === 'POST')).toMatchObject({ body: { medium: 'audio', text: 'I was at home at nine in the evening.', transcriptRequest: 'r1' } })
  expect(calls.find((c) => c.url === '/ai/v1/decisions')).toMatchObject({ body: { request_id: 'r1', decision: 'edited', feature: 'statement_transcribe', case_ref: 'f1' } })
  // how it was recorded can be changed again once the draft is saved or discarded
  await vi.waitFor(() => expect((screen.getByLabelText('How it was recorded') as HTMLSelectElement).disabled).toBe(false))
  // a second recording, discarded
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['y'], 'b.m4a')] } })
  fireEvent.click(await screen.findByRole('button', { name: 'Discard the draft' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.url === '/ai/v1/decisions')).toHaveLength(2))
  expect(calls.filter((c) => c.url === '/ai/v1/decisions')[1]).toMatchObject({ body: { request_id: 'r2', decision: 'rejected' } })
  expect((screen.getByLabelText('The statement, in the words and language spoken') as HTMLTextAreaElement).value).toBe('')
})

test('a draft saved as it was written is accepted; no file, or a refusal by the speech model, changes nothing and shows the reason', async () => {
  const calls: { url: string; body?: unknown }[] = []
  let fail = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body instanceof Blob || !init?.body ? undefined : JSON.parse(init.body as string) })
    if (url.startsWith('/ai/v1/transcribe')) return fail
      ? { ok: false, status: 503, json: async () => ({ detail: 'the speech model small is not installed on this server' }) }
      : { ok: true, status: 200, json: async () => ({ request_id: 'r9', text: 'Spoken words.' }) }
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => data }
  }))
  render(<Statements firId="f1" />)
  await screen.findByText('बाबा व्हिडिओ कॉलवर होते.')
  fireEvent.change(screen.getByLabelText('How it was recorded'), { target: { value: 'audio' } })
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [] } })
  expect(calls.some((c) => c.url.startsWith('/ai/v1/transcribe'))).toBe(false)
  fail = true
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['x'], 'a.m4a')] } })
  expect((await screen.findByRole('alert')).textContent).toContain('not installed on this server')
  fail = false
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['x'], 'a.m4a')] } })
  await screen.findByText(/A draft was written down/)
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/ai/v1/decisions')).toBe(true))
  expect(calls.find((c) => c.url === '/ai/v1/decisions')?.body).toMatchObject({ request_id: 'r9', decision: 'accepted' })
})

test('while a draft of a recording is held it is saved as that recording; another recording logs the first draft as rejected', async () => {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  let transcribed = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body instanceof Blob || !init?.body ? undefined : JSON.parse(init.body as string) })
    if (url.startsWith('/ai/v1/transcribe')) return { ok: true, status: 200, json: async () => ({ request_id: `r${++transcribed}`, text: `Draft ${transcribed}.` }) }
    if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ ...data, statements: [{ ...data.statements[0], from_recording: true }] }) }
  }))
  render(<Statements firId="f1" />)
  // a saved statement that began as the model's draft says so
  expect(await screen.findByText(/Written down from the recording by the speech model on this server/)).toBeTruthy()
  const medium = screen.getByLabelText('How it was recorded') as HTMLSelectElement
  fireEvent.change(medium, { target: { value: 'audio' } })
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['x'], 'a.m4a')] } })
  await screen.findByDisplayValue('Draft 1.')
  expect(medium.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText(/Write down a recording/), { target: { files: [new File(['y'], 'b.m4a')] } })
  await screen.findByDisplayValue('Draft 2.')
  expect(calls.filter((c) => c.url === '/ai/v1/decisions').map((c) => [c.body!.request_id, c.body!.decision])).toEqual([['r1', 'rejected']])
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.url === '/ai/v1/decisions')).toHaveLength(2))
  expect(calls.find((c) => c.url === '/api/firs/f1/statements' && c.method === 'POST')!.body).toMatchObject({ medium: 'audio', transcriptRequest: 'r2' })
  // a statement typed afterwards carries no recording
  await vi.waitFor(() => expect(medium.disabled).toBe(false))
  fireEvent.change(medium, { target: { value: 'written' } })
  fireEvent.change(screen.getByLabelText('The statement, in the words and language spoken'), { target: { value: 'Typed words.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.url === '/api/firs/f1/statements' && c.method === 'POST')).toHaveLength(2))
  expect(calls.filter((c) => c.url === '/api/firs/f1/statements' && c.method === 'POST')[1].body).not.toHaveProperty('transcriptRequest')
})
