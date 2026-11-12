// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FinalReport from './FinalReport'
import NarrativeDraft from './NarrativeDraft'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const FIR = 'On 3 Nov a caller said he was from my bank and Rs 40,000 went out of my account.'
const statements = [
  { id: 'st1', label: 'W1', name: 'Fictional Witness', masked: false, recorded_at: '2026-11-05T10:00:00Z', original_text: 'मी आरोपीला एटीएमजवळ पाहिले.', translated_text: 'I saw the accused near the ATM.' },
  { id: 'st2', label: null, name: null, masked: true, recorded_at: '2026-11-06T10:00:00Z', original_text: 'Masked words never sent.', translated_text: null },
]
const ANSWER = [
  { part: 'facts', text: 'The complainant stated that a caller said he was from her bank.', source: 'FIR', quote: 'a caller said he was from my bank' },
  { part: 'evidence', text: 'W1 stated that he saw the accused near the ATM.', source: 'T1', quote: 'I saw the accused near the ATM' },
  { part: 'evidence', text: 'The accused is guilty of cheating.', source: 'FIR', quote: 'Rs 40,000' },
  { part: 'facts', text: 'A made-up sentence.', source: 'FIR', quote: 'not in the text' },
]

function stub(answer: unknown = ANSWER, fail?: string) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/statements')) return { ok: true, status: 200, json: async () => ({ witnesses: [], statements }) }
    if (url.endsWith('/v1/generate')) {
      if (fail) return { ok: false, status: 403, json: async () => ({ detail: fail }) }
      return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft: typeof answer === 'string' ? answer : JSON.stringify(answer), provider: 'fake', model: 'echo' }) }
    }
    if (url.endsWith('/v1/decisions')) return { ok: true, status: 200, json: async () => ({ logged: 9 }) }
    if (url.endsWith('/final-report') && init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ id: 'd1', status: 'draft' }) }
    return { ok: true, status: 200, json: async () => ({ draft: null, events: [], readinessChecked: true, openGaps: 0, canApprove: false,
      particulars: { sections: 'BNS 318(4)', accused: 1, witnesses: 1, statements_from: 1, evidence_items: 0 } }) }
  }))
  return calls
}

test('the officer ticks drafted sentences, they go into the draft with their sources, and the save names the AI request', async () => {
  const calls = stub()
  render(<FinalReport firId="f1" me="u1" text={FIR} victimProtected={false} />)
  fireEvent.change(await screen.findByLabelText('Facts in brief'), { target: { value: 'My own words.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  expect(await screen.findByText('AI draft · tick the sentences to take')).toBeTruthy()
  const prompt = String(calls.find((c) => c.url.endsWith('/v1/generate'))!.body!.prompt)
  expect(prompt).toContain(FIR)
  expect(prompt).toContain('Piece S1 (statement):\n<<<\nमी आरोपीला एटीएमजवळ पाहिले.')
  expect(prompt).toContain('Piece T1 (English translation of a statement):')
  expect(prompt).not.toContain('Masked words never sent.')
  expect(calls.find((c) => c.url.endsWith('/v1/generate'))!.body).toMatchObject({ feature: 'chargesheet_draft', case_ref: 'f1', prompt_version: 'chargesheet_draft/narrative@1' })
  expect(screen.getByText(/1 sentences of the AI did not point/)).toBeTruthy()
  expect(screen.getByText(/1 sentences gave an opinion on guilt/)).toBeTruthy()
  expect(screen.queryByText('The accused is guilty of cheating.')).toBeNull()
  expect(screen.getByText('I saw the accused near the ATM')).toBeTruthy()   // the quote, marked
  fireEvent.click(screen.getByLabelText(/a caller said he was from her bank/))
  fireEvent.click(screen.getByRole('button', { name: 'Take the ticked sentences into the draft' }))
  expect(await screen.findByText(/Your decision \(partly kept or corrected\) is logged. 1 sentences were added/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ request_id: 'r1', decision: 'edited', feature: 'chargesheet_draft', case_ref: 'f1' })
  expect((screen.getByLabelText('Facts in brief') as HTMLTextAreaElement).value).toBe('My own words.\n\nThe complainant stated that a caller said he was from her bank. (FIR)')
  expect((screen.getByLabelText('Evidence for the charges') as HTMLTextAreaElement).value).toBe('')
  expect(screen.queryByRole('button', { name: 'Draft with AI from the file' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
  expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ aiRequestId: 'r1', facts: 'My own words.\n\nThe complainant stated that a caller said he was from her bank. (FIR)' })
})

test('all ticked is accepted and cites a statement and its translation by who and when; nothing ticked is rejected and changes nothing', async () => {
  stub()
  const onTake = vi.fn()
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={onTake} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  await screen.findByText('AI draft · tick the sentences to take')
  expect(screen.getByText(/From English translation of the statement of W1, 5 Nov 2026:/)).toBeTruthy()
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box)
  fireEvent.click(screen.getByRole('button', { name: 'Take the ticked sentences into the draft' }))
  await screen.findByText(/Your decision \(all kept\) is logged/)
  expect(onTake).toHaveBeenCalledWith('The complainant stated that a caller said he was from her bank. (FIR)',
    'W1 stated that he saw the accused near the ATM. (English translation of the statement of W1, 5 Nov 2026)', 'r1')
  cleanup()
  const calls = stub()
  const none = vi.fn()
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={none} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Take the ticked sentences into the draft' }))
  await screen.findByText(/Your decision \(rejected\) is logged. 0 sentences/)
  expect(none).not.toHaveBeenCalled()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected' })
})

test('an unreadable answer, an answer with nothing grounded, a refusal of the gateway, a protected case and a case without FIR text', async () => {
  stub('I cannot help.')
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="BNS 318(4)" language="mr" written={{ facts: '', evidence: '' }} onTake={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  expect(await screen.findByText(/could not be read as a list of sentences/)).toBeTruthy()
  cleanup()
  stub([])
  render(<NarrativeDraft firId="f1" text={null} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  expect(await screen.findByText('The AI wrote no sentence that points at words of the file.')).toBeTruthy()
  cleanup()
  stub(ANSWER, 'cloud refused')
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  expect((await screen.findByRole('alert')).textContent).toContain('cloud refused')
  cleanup()
  const calls = stub()
  render(<FinalReport firId="f1" me="u1" text={FIR} victimProtected />)
  expect(await screen.findByText(/not offered on a case that protects the victim's identity: the file/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Draft with AI from the file' })).toBeNull()
  expect(calls.some((c) => c.url.includes('/ai/'))).toBe(false)
})

test('a failed decision log is shown and the sentences are not taken', async () => {
  const calls = stub()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url.endsWith('/v1/decisions')) return { ok: false, status: 409, json: async () => ({ detail: 'already logged' }) }
    if (url.endsWith('/statements')) return { ok: true, status: 200, json: async () => ({ witnesses: [], statements: [] }) }
    return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft: JSON.stringify(ANSWER), provider: 'fake', model: 'echo' }) }
  }))
  const onTake = vi.fn()
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={onTake} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  fireEvent.click(await screen.findByLabelText(/a caller said he was from her bank/))
  fireEvent.click(screen.getByRole('button', { name: 'Take the ticked sentences into the draft' }))
  expect((await screen.findByRole('alert')).textContent).toContain('already logged')
  expect(onTake).not.toHaveBeenCalled()
})

test('a statement is cited by the person\'s name when it has no label, or by a dash; an unreadable answer is logged as rejected', async () => {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  const list = [
    { id: 'a', label: null, name: 'Fictional Name', masked: false, recorded_at: '2026-11-05T10:00:00Z', original_text: 'I heard the call.', translated_text: null },
    { id: 'b', label: null, name: null, masked: false, recorded_at: '2026-11-06T10:00:00Z', original_text: 'I saw the phone.', translated_text: null },
  ]
  let draft = JSON.stringify([{ part: 'evidence', text: 'One heard the call.', source: 'S1', quote: 'heard the call' }, { part: 'evidence', text: 'One saw the phone.', source: 'S2', quote: 'saw the phone' }])
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/statements')) return { ok: true, status: 200, json: async () => ({ witnesses: [], statements: list }) }
    if (url.endsWith('/v1/decisions')) return { ok: true, status: 200, json: async () => ({ logged: 1 }) }
    return { ok: true, status: 200, json: async () => ({ request_id: 'r2', draft, provider: 'fake', model: 'echo' }) }
  }))
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  expect(await screen.findByText(/From statement of Fictional Name, 5 Nov 2026:/)).toBeTruthy()
  expect(screen.getByText(/From statement of —, 6 Nov 2026:/)).toBeTruthy()
  cleanup()
  draft = 'no list here'
  render(<NarrativeDraft firId="f1" text={FIR} victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Draft with AI from the file' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Take the ticked sentences into the draft' }))
  await screen.findByText(/Your decision \(rejected\) is logged. 0 sentences/)
  expect(calls.filter((c) => c.url.endsWith('/v1/decisions')).pop()!.body).toMatchObject({ decision: 'rejected', request_id: 'r2' })
})
