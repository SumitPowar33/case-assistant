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
    // no embedding model on this server: the passages are found by words alone (the meaning search has its own tests below)
    if (url === '/ai/v1/embed') return { ok: false, status: 503, json: async () => ({ detail: 'the embedding model is not installed' }) }
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
    if (url === '/ai/v1/embed') return Promise.resolve({ ok: false, status: 503, json: async () => ({}) })
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

// ---- the meaning search (item 17): vectors from the gateway's embedding model, kept in the core app ----

const wired = [
  { id: 'P1', kind: 'complaint', title: 'FIR complaint', text: `Fictional complaint. ${'A filler sentence of no use. '.repeat(20)}The wire of Rs 9,80,000 was made on 21 August 2026.` },
  { id: 'P2', kind: 'diary', title: 'Case diary, 05 Nov 2026', text: 'Nothing about the case here, only the weather.\nA second line.' },
]

/** The embedding model puts a text with "wire" at [1,0] and a question at [1,0]; any other text at [0,1]. The core keeps what it is sent. */
function meaningStub(opts: { embedFails?: boolean; stored?: { hash: string; vec: number[] }[]; saveFails?: boolean } = {}) {
  const log: { url: string; method: string; body?: Record<string, unknown> }[] = []
  let stored = opts.stored ?? []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    const method = init?.method ?? 'GET'
    const reply = (b: unknown, status = 200) => ({ ok: status < 300, status, json: async () => b })
    if (url === '/ai/v1/embed') {
      log.push({ url, method, body })
      if (opts.embedFails) return reply({ detail: 'the embedding model is not installed' }, 503)
      return reply({ model: 'test-model', dim: 2, min_similarity: 0.5,
        vectors: body.texts.map((t: string) => (body.kind === 'query' || t.includes('wire') ? [1, 0] : [0, 1])) })
    }
    if (url.startsWith('/api/firs/f1/case-file/vectors')) {
      log.push({ url, method, body })
      if (method === 'PUT') {
        if (opts.saveFails) return reply({}, 500)
        stored = [...stored.filter((x) => body.keep.includes(x.hash) && !body.items.some((i: { hash: string }) => i.hash === x.hash)), ...body.items]
        return reply({ saved: body.items.length, removed: 0 })
      }
      return reply({ model: 'test-model', items: stored })
    }
    if (url === '/ai/v1/generate') { log.push({ url, method, body }); return reply({ request_id: 'r1', draft: 'The wire was made on 21 August [S1].', provider: 'fake', model: 'm' }) }
    if (url === '/api/firs/f1/diary') { log.push({ url, method, body }); return reply({ at: 'now' }, opts.saveFails ? 409 : 201) }
    return reply({ passages: wired })
  }))
  return log
}

test('a question with none of the file\'s words is answered from the piece whose meaning is close, and the vectors are kept in the core', async () => {
  const log = meaningStub()
  render(<AskCaseFile firId="f1" />)
  await ask('Where did the funds go?')
  expect(await screen.findByText(/The wire was made on 21 August/)).toBeTruthy()
  const gen = log.find((c) => c.url === '/ai/v1/generate')!
  expect(String(gen.body!.prompt)).toContain('[S1] FIR complaint, part 2 of 2: ')
  expect(String(gen.body!.prompt)).not.toContain('weather')
  const embeds = log.filter((c) => c.url === '/ai/v1/embed')
  expect(embeds.map((c) => c.body!.kind)).toEqual(['query', 'passage'])
  expect(embeds[1].body).toMatchObject({ case_ref: 'f1' })
  const texts = embeds[1].body!.texts as string[]   // every piece: the complaint cut in two, and the diary line
  expect(texts).toHaveLength(3)
  expect(texts[0]).toMatch(/^FIR complaint: Fictional complaint\./)
  const save = log.find((c) => c.method === 'PUT')!
  expect(save.body).toMatchObject({ model: 'test-model' })
  expect((save.body!.items as unknown[])).toHaveLength(3)
  expect((save.body!.keep as unknown[])).toHaveLength(3)
  expect(screen.queryByText('Found by words only')).toBeNull()
})

test('a piece that already has its vector is not embedded again, and a vector of a piece that is gone is removed', async () => {
  const first = meaningStub()
  render(<AskCaseFile firId="f1" />)
  await ask('Where did the funds go?')
  await screen.findByText(/The wire was made/)
  const items = (first.find((c) => c.method === 'PUT')!.body!.items as { hash: string; vec: number[] }[])
  cleanup()
  const second = meaningStub({ stored: items })
  render(<AskCaseFile firId="f1" />)
  await ask('Where did the funds go?')
  await screen.findByText(/The wire was made/)
  expect(second.filter((c) => c.url === '/ai/v1/embed').map((c) => c.body!.kind)).toEqual(['query'])
  expect(second.some((c) => c.method === 'PUT')).toBe(false)
  cleanup()
  const third = meaningStub({ stored: [...items, { hash: '0123456789abcd', vec: [0, 1] }] })
  render(<AskCaseFile firId="f1" />)
  await ask('Where did the funds go?')
  await screen.findByText(/The wire was made/)
  expect(third.find((c) => c.method === 'PUT')!.body).toMatchObject({ items: [], keep: items.map((i) => i.hash) })
})

test('with no embedding model the answer says it was found by words only', async () => {
  meaningStub({ embedFails: true })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the wire made?')
  expect(await screen.findByText(/The wire was made/)).toBeTruthy()
  expect(screen.getByText('Found by words only')).toBeTruthy()
})

test('when the vectors cannot be kept the question is still answered, by words only', async () => {
  meaningStub({ saveFails: true })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the wire made?')
  expect(await screen.findByText(/The wire was made/)).toBeTruthy()
  expect(screen.getByText('Found by words only')).toBeTruthy()
})

test('a source opens on click as its whole passage with the piece marked', async () => {
  meaningStub({ embedFails: true })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the wire made?')
  await screen.findByText(/The wire was made/)
  fireEvent.click(screen.getByText('Whole passage'))
  const mark = document.querySelector('details pre mark')!
  expect(mark.textContent).toMatch(/wire of Rs 9,80,000 was made on 21 August 2026\.$/)
  expect(mark.parentElement!.textContent!.startsWith('Fictional complaint. A filler sentence')).toBe(true)   // the rest of the passage is around it
  expect(mark.parentElement!.textContent!.length).toBeGreaterThan(mark.textContent!.length)
})

test('the officer notes an answer in the case diary: the text is theirs to change, and only then is it saved', async () => {
  const log = meaningStub({ embedFails: true })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the wire made?')
  await screen.findByText(/The wire was made/)
  fireEvent.click(screen.getByRole('button', { name: 'Note in case diary' }))
  const box = screen.getByLabelText(/Diary entry/) as HTMLTextAreaElement
  expect(box.value).toContain('Question: When was the wire made?')
  expect(box.value).toContain('Answer (AI draft, checked against the sources): The wire was made on 21 August [S1].')
  expect(box.value).toContain('Where this comes from: S1 FIR complaint')
  expect(log.some((c) => c.url === '/api/firs/f1/diary')).toBe(false)
  fireEvent.change(box, { target: { value: 'Checked: the wire was on 21 August.' } })
  fireEvent.click(screen.getByRole('button', { name: "Save on today's diary page" }))
  expect(await screen.findByText("Saved on today's page of the case diary.")).toBeTruthy()
  expect(log.find((c) => c.url === '/api/firs/f1/diary')).toMatchObject({ method: 'POST', body: { text: 'Checked: the wire was on 21 August.' } })
})

test('a closed diary page is said so and the note can be cancelled; no note button on an answer without a source', async () => {
  meaningStub({ embedFails: true, saveFails: true })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the wire made?')
  await screen.findByText(/The wire was made/)
  fireEvent.click(screen.getByRole('button', { name: 'Note in case diary' }))
  fireEvent.click(screen.getByRole('button', { name: "Save on today's diary page" }))
  expect((await screen.findByRole('alert')).textContent).toContain('409')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Note in case diary' })).toBeTruthy()
  cleanup()
  const calls = stub({ generate: draft('NOT IN THE FILE') })
  render(<AskCaseFile firId="f1" />)
  await ask('When was the transfer?')
  await screen.findByText('NOT IN THE FILE')
  expect(screen.queryByRole('button', { name: 'Note in case diary' })).toBeNull()
  expect(calls).toHaveLength(1)
})
