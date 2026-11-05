// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Court from './Court'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const list = {
  cases: [
    { fir_id: 'f1', fir_no: 7, fir_year: 2026, station: 'Fictional PS', court: 'Fictional Court 4', case_no: 'CC 1/2026', next_date: '2026-12-18', events: 3, summons_open: 2 },
    { fir_id: 'f2', fir_no: 8, fir_year: 2026, station: 'Fictional PS', court: null, case_no: null, next_date: null, events: 1, summons_open: 0 },
  ],
  counts: { coming: 1, no_date: 1 },
}
const one = {
  events: [
    { id: 'e1', kind: 'chargesheet_filed', on_date: '2026-11-08', court: 'Fictional Court 4', case_no: 'CC 1/2026', note: null },
    { id: 'e2', kind: 'charge_framing', on_date: '2026-12-18', court: null, case_no: null, note: 'Brief ready' },
    { id: 'e3', kind: 'odd', on_date: '2027-01-05', court: 'Fictional Court 4', case_no: null, note: null },
  ],
  summons: [
    { id: 's1', witness: 'Fictional Witness A', role: 'Seizure witness', status: 'served', on_date: '2026-11-20', note: null },
    { id: 's2', witness: 'Fictional Witness B', role: null, status: 'not_served', on_date: '2026-11-21', note: 'Moved address' },
    { id: 's3', witness: 'Fictional Witness C', role: null, status: 'strange', on_date: '2026-11-21', note: null },
  ],
}

function stub(load: unknown = list, detail: unknown = one, write = { status: 201 }) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => ({ message: 'Only the case team can do this.' }) }
    if (url.startsWith('/api/firs?')) return { ok: true, status: 200, json: async () => [{ id: 'f1', fir_no: 7, fir_year: 2026 }] }
    return { ok: true, status: 200, json: async () => (url.endsWith('/court') && url !== '/api/court' ? detail : load) }
  }))
  return calls
}

test('the list shows each case with its court, next date, open summons and the counts', async () => {
  stub()
  render(<Court />)
  const table = await screen.findByRole('table', { name: 'Cases in court' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1].textContent).toContain('FIR 7/2026')
  expect(rows[1].textContent).toContain('Fictional Court 4')
  expect(rows[1].textContent).toContain('CC 1/2026')
  expect(rows[1].textContent).toContain('2026-12-18')
  expect(rows[1].textContent).toContain('Not yet served: 2')
  expect(rows[2].textContent).toContain('—')
  expect(screen.getByText('Coming dates: 1')).toBeTruthy()
  expect(screen.getByText('No coming date: 1')).toBeTruthy()
})

test('an empty list says nothing yet, a missing count is zero and a failed read shows its error', async () => {
  stub({ cases: [], counts: {} })
  render(<Court />)
  expect(await screen.findByText('None yet.')).toBeTruthy()
  expect(screen.getByText('Coming dates: 0')).toBeTruthy()
  cleanup()
  stub({})
  render(<Court />)
  expect(await screen.findByText('None yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<Court />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})

test('picking a case shows its timeline and the newest summons status of each witness', async () => {
  stub()
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 7/2026' }))
  const timeline = await screen.findByRole('table', { name: 'Timeline of court dates' })
  const rows = within(timeline).getAllByRole('row')
  expect(rows).toHaveLength(4)
  expect(rows[1].textContent).toContain('Chargesheet filed')
  expect(rows[1].textContent).toContain('Fictional Court 4 · CC 1/2026')
  expect(rows[2].textContent).toContain('Brief ready')
  expect(rows[3].textContent).toContain('odd')   // a stage the screen does not know is shown as it is
  const summons = within(screen.getByRole('table', { name: 'Summons to witnesses' })).getAllByRole('row')
  expect(summons[1].textContent).toContain('Seizure witness')
  expect(summons[2].textContent).toContain('Not served (not found or moved)')
  expect(summons[2].textContent).toContain('Moved address')
  expect(summons[3].textContent).toContain('strange')
  expect(screen.getByRole('link', { name: 'Open FIR 7/2026' }).getAttribute('href')).toBe('#/firs/f1')
})

test('a court date and a summons step go to their routes, then the list is read again; a refusal shows its reason', async () => {
  const calls = stub()
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 7/2026' }))
  const dateForm = (await screen.findByRole('heading', { name: 'Add a court date' })).closest('form')!
  const d = (label: string) => within(dateForm).getByLabelText(new RegExp(label))
  fireEvent.change(d('Stage'), { target: { value: 'judgment' } })
  fireEvent.change(d('Date'), { target: { value: '2027-02-01' } })
  fireEvent.change(d('Court$'), { target: { value: ' Fictional Court 4 ' } })
  fireEvent.change(d('Court case number'), { target: { value: 'CC 1/2026' } })
  fireEvent.change(d('Note'), { target: { value: ' final ' } })
  fireEvent.submit(dateForm)
  await waitFor(() => expect(calls.some((c) => c.url === '/api/firs/f1/court-events')).toBe(true))
  expect(calls.find((c) => c.url === '/api/firs/f1/court-events')!.body).toEqual({ kind: 'judgment', date: '2027-02-01', court: 'Fictional Court 4', caseNo: 'CC 1/2026', note: 'final' })
  const sForm = screen.getByRole('heading', { name: 'Record a summons step' }).closest('form')!
  const s = (label: string) => within(sForm).getByLabelText(new RegExp(label))
  fireEvent.change(s('Witness'), { target: { value: 'Fictional Witness D' } })
  fireEvent.change(s('Status'), { target: { value: 'appeared' } })
  fireEvent.change(s('Date'), { target: { value: '2026-11-25' } })
  fireEvent.submit(sForm)
  await waitFor(() => expect(calls.some((c) => c.url === '/api/firs/f1/court-summons')).toBe(true))
  expect(calls.find((c) => c.url === '/api/firs/f1/court-summons')!.body).toEqual({ witness: 'Fictional Witness D', role: '', status: 'appeared', date: '2026-11-25', note: '' })
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/court').length).toBeGreaterThan(1))
  cleanup()
  stub(list, one, { status: 403 })
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 7/2026' }))
  fireEvent.submit((await screen.findByRole('heading', { name: 'Add a court date' })).closest('form')!)
  expect((await screen.findByRole('alert')).textContent).toContain('Only the case team can do this.')
})

test('a failed read of one case shows its error', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/court' || url.startsWith('/api/firs?'))
    ? { ok: true, status: 200, json: async () => (url === '/api/court' ? list : []) } : { ok: false, status: 404, json: async () => ({}) }))
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 7/2026' }))
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})

test('a case with an answer of another shape shows empty tables, and the first-date form starts a record, with a refusal shown', async () => {
  const calls = stub(list, {})
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 7/2026' }))
  expect(await screen.findByRole('table', { name: 'Timeline of court dates' })).toBeTruthy()
  const form = screen.getByRole('heading', { name: 'Start a court record' }).closest('form')!
  await within(form).findByRole('option', { name: 'FIR 7/2026' })
  const f = (label: string) => within(form).getByLabelText(new RegExp(label))
  fireEvent.change(f('Case'), { target: { value: 'f1' } })
  fireEvent.change(f('Date'), { target: { value: '2026-11-08' } })
  fireEvent.submit(form)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ kind: 'chargesheet_filed', date: '2026-11-08', court: '', caseNo: '', note: '' })
  cleanup()
  stub(list, one, { status: 403 })
  render(<Court />)
  const again = (await screen.findByRole('heading', { name: 'Start a court record' })).closest('form')!
  fireEvent.submit(again)
  expect((await within(again).findByRole('alert')).textContent).toContain('Only the case team can do this.')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.startsWith('/api/firs?') ? {} : list) })))
  render(<Court />)
  expect(await screen.findByRole('option', { name: 'Choose a case' })).toBeTruthy()
})
