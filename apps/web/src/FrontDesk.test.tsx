// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ComplaintPage, FrontDeskPage } from './FrontDesk'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'hc.fictional', full_name: 'HC Fictional', rank: 'HC', role: 'front_desk', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null); window.location.hash = '' })

function stub(lists: Record<string, unknown>, write: { status: number; body: unknown } = { status: 201, body: { id: 'c9' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  return writes
}

const kinds = [{ id: 'cyber_financial_fraud', label: 'Online financial fraud', steps: [] }, { id: 'other', label: 'Other information', steps: [] }]
const base = {
  id: 'c1', received_at: '2026-10-30T04:30:00Z', mode: 'oral', informant_name: 'Fictional Informant', informant_contact: null, kind: 'cyber_financial_fraud',
  kind_label: 'Online financial fraud', text_original: 'Fictional caller took money.', text_language: 'mr', recorded_by_name: 'HC Fictional',
  read_back_language: null, signed_at: null, signed_by_name: null, outcome: null, outcome_reason: null, fir_id: null, fir_no: null, fir_year: null, sign_by: null, enquiry_due: null,
  steps: [
    { id: 'report_1930', text: 'Report on 1930', basis: 'MHA I4C', due_at: '2026-10-30T05:30:00Z', done_at: null, done_by_name: null, note: null, overdue: true },
    { id: 'note_transactions', text: 'Write down every transaction', basis: null, due_at: '2026-10-30T05:30:00Z', done_at: '2026-10-30T04:40:00Z', done_by_name: 'HC Fictional', note: 'UTR noted', overdue: false },
  ],
}

test('the front desk lists open complaints with overdue steps and writes a new one down', async () => {
  const writes = stub({ '/complaints?open=true': [{ id: 'c1', received_at: base.received_at, mode: 'oral', informant_name: 'Fictional Informant', kind: 'cyber_financial_fraud', signed_at: null, outcome: null, steps_overdue: 2 }], '/complaint-kinds': kinds })
  render(<FrontDeskPage />)
  expect(await screen.findByText('2 steps overdue', { exact: false })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'Online financial fraud' })).toBeTruthy()
  const form = screen.getByText('Take a complaint').closest('details')!
  fireEvent.change(within(form).getByLabelText(/^Received/), { target: { value: '2026-10-30T10:00' } })
  fireEvent.change(within(form).getByLabelText("Informant's name"), { target: { value: 'Fictional Informant Two' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  expect((await within(form).findByRole('alert')).textContent).toContain("informant's words")
  fireEvent.change(within(form).getByLabelText(/Information as given/), { target: { value: 'Fictional words' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/complaints', body: { stationId: 's1', receivedAt: '2026-10-30T10:00:00+05:30', mode: 'oral', informantName: 'Fictional Informant Two',
    informantContact: null, kind: 'other', text: 'Fictional words', textLanguage: 'en' } })
  await vi.waitFor(() => expect(window.location.hash).toBe('#/complaints/c9'))
})

test('the Speak button shows only where the unit allows cloud processing of case text', async () => {
  class R { start() {} stop() {} }
  vi.stubGlobal('webkitSpeechRecognition', R)
  stub({ '/complaint-kinds': kinds, '/me': { ai_cloud_allowed: false } })
  render(<FrontDeskPage />)
  await screen.findByText('No open complaints.')
  expect(screen.queryByRole('button', { name: 'Speak' })).toBeNull()
  cleanup()
  stub({ '/complaint-kinds': kinds, '/me': { ai_cloud_allowed: true } })
  render(<FrontDeskPage />)
  expect(await screen.findByRole('button', { name: 'Speak' })).toBeTruthy()
})

test('an empty front desk says so; an error is shown', async () => {
  stub({ '/complaint-kinds': kinds })
  render(<FrontDeskPage />)
  expect(await screen.findByText('No open complaints.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
  render(<FrontDeskPage />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})

test('spoken information is read over in a language, signed, and its steps are marked done', async () => {
  const writes = stub({ '/complaints/c1': base }, { status: 204, body: null })
  render(<ComplaintPage id="c1" />)
  expect((await screen.findByText('Fictional caller took money.')).getAttribute('lang')).toBe('mr')
  expect(screen.getByText(/overdue, was due/)).toBeTruthy()
  expect(screen.getByText(/done/, { selector: 'strong' }).closest('li')!.textContent).toContain('UTR noted')
  expect(screen.getByText('An FIR can be registered once the informant has signed.')).toBeTruthy()
  const sign = screen.getByText('Read over to the informant and signed').closest('details')!
  expect((within(sign).getByLabelText('Read over in') as HTMLSelectElement).value).toBe('mr')
  fireEvent.click(within(sign).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/complaints/c1/sign', body: { readBackLanguage: 'mr' } })
  const step = screen.getByText(/Report on 1930/).closest('li')!
  fireEvent.change(within(step).getByLabelText(/^Note/), { target: { value: 'Ack 77' } })
  fireEvent.click(within(step).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toEqual({ url: '/api/complaints/c1/steps', body: { stepId: 'report_1930', note: 'Ack 77' } })
})

test('a signed complaint offers the FIR from its text, or closing it with a reason', async () => {
  const writes = stub({ '/complaints/c1': { ...base, signed_at: '2026-10-30T04:50:00Z', signed_by_name: 'HC Fictional', read_back_language: 'mr', steps: [] } }, { status: 201, body: { id: 'f7' } })
  render(<ComplaintPage id="c1" />)
  expect(await screen.findByText(/Read over to the informant in Marathi, admitted correct and signed/)).toBeTruthy()
  const fir = screen.getByText('Register the FIR from this complaint').closest('details')!
  expect(within(fir).queryByLabelText(/Information as given/)).toBeNull()
  fireEvent.change(within(fir).getByLabelText('FIR number'), { target: { value: '31' } })
  fireEvent.change(within(fir).getByLabelText('General diary entry'), { target: { value: 'GD-31' } })
  fireEvent.change(within(fir).getByLabelText(/^Registered/), { target: { value: '2026-10-30T11:00' } })
  fireEvent.click(within(fir).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body).toMatchObject({ complaintId: 'c1', firNo: 31, registeredAt: '2026-10-30T11:00:00+05:30' })
  expect(writes[0].body).not.toHaveProperty('contentsOriginal')
  const close = screen.getByText('Close without an FIR').closest('details')!
  expect(within(close).queryByRole('option', { name: /not signed within three days/ })).toBeNull()
  fireEvent.change(within(close).getByLabelText('Outcome'), { target: { value: 'ncr' } })
  fireEvent.change(within(close).getByLabelText(/^Reason/), { target: { value: 'Fictional: non-cognizable' } })
  fireEvent.click(within(close).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toEqual({ url: '/api/complaints/c1/outcome', body: { outcome: 'ncr', reason: 'Fictional: non-cognizable' } })
})

test('electronic information shows its signing deadline and may lapse; a closed complaint shows its outcome', async () => {
  stub({ '/complaints/c1': { ...base, mode: 'electronic', sign_by: '2026-11-02T04:30:00Z', steps: [] } })
  render(<ComplaintPage id="c1" />)
  expect(await screen.findByText(/must sign by 2 Nov 2026/)).toBeTruthy()
  const close = screen.getByText('Close without an FIR').closest('details')!
  expect(within(close).getAllByRole('option').map((o) => o.textContent)).toEqual(['Electronic information not signed within three days'])
  cleanup()
  stub({ '/complaints/c1': { ...base, mode: 'written', signed_at: '2026-10-30T04:50:00Z', signed_by_name: 'HC Fictional', outcome: 'fir', fir_id: 'f7', fir_no: 31, fir_year: 2026, steps: [] } })
  render(<ComplaintPage id="c1" />)
  expect((await screen.findByRole('link', { name: 'FIR 31/2026' })).getAttribute('href')).toBe('#/firs/f7')
  expect(screen.getByText(/^Signed by the informant/)).toBeTruthy()
  cleanup()
  stub({ '/complaints/c1': { ...base, signed_at: '2026-10-30T04:50:00Z', outcome: 'no_offence', outcome_reason: 'Fictional: civil dispute', steps: [] } })
  render(<ComplaintPage id="c1" />)
  expect(await screen.findByText(/No offence disclosed: Fictional: civil dispute/)).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  render(<ComplaintPage id="c9" />)
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})

test('a write answered with an empty body still counts as saved', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? { ok: true, status: 201, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } }
    : { ok: true, status: 200, json: async () => ({ ...base, steps: [base.steps[0]] }) }))
  render(<ComplaintPage id="c1" />)
  const step = (await screen.findByText(/Report on 1930/)).closest('li')!
  fireEvent.click(within(step).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(2))
  expect(within(step).queryByRole('alert')).toBeNull()
})

test('a signed complaint has a copy for the informant to print; a preliminary enquiry shows its 14-day limit', async () => {
  const print = vi.fn()
  vi.stubGlobal('print', print)
  stub({ '/complaints/c1': { ...base, signed_at: '2026-10-30T04:50:00Z', signed_by_name: 'HC Fictional', read_back_language: 'mr', steps: [] } })
  render(<ComplaintPage id="c1" />)
  const copy = (await screen.findByLabelText('Copy for the informant')) as HTMLElement
  expect(within(copy).getByText('Fictional caller took money.').getAttribute('lang')).toBe('mr')
  fireEvent.click(within(copy).getByRole('button', { name: 'Print the copy' }))
  expect(print).toHaveBeenCalledOnce()
  cleanup()
  stub({ '/complaints/c1': { ...base, signed_at: '2026-10-30T04:50:00Z', outcome: 'preliminary_enquiry', outcome_reason: 'Fictional: 3 to 7 years', enquiry_due: '2026-11-13T05:00:00Z', steps: [] } })
  render(<ComplaintPage id="c1" />)
  expect(await screen.findByText(/to be finished by 13 Nov 2026/)).toBeTruthy()
  cleanup()
  stub({ '/complaints/c1': { ...base, steps: [] } })
  render(<ComplaintPage id="c1" />)
  await screen.findByText('Fictional caller took money.')
  expect(screen.queryByLabelText('Copy for the informant')).toBeNull()
})
