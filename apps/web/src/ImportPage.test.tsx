// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ImportPage from './ImportPage'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', can_import: true } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const batch = (over: Record<string, unknown> = {}) => ({
  id: 'b1', station_name: 'Demo PS', filename: 'old.csv', status: 'staged', rows_total: 3, rows_ok: 1, rows_warning: 1, rows_error: 1, rows_duplicate: 0,
  rows_imported: null, created_at: '2026-10-28T10:00:00Z', created_by_name: 'SHO One', approved_by_name: null, authority_note: null, undo_reason: null, ...over,
})
const rows = [
  { row_no: 1, status: 'ok', messages: [], raw: { 'FIR No': '1', Date: '05/03/2024' } },
  { row_no: 2, status: 'warning', messages: [{ level: 'warning', field: 'gd_entry_no', text: 'The General Diary entry is missing' }, { level: 'info', field: 'sections', text: 'IPC 379 is BNS 303' }], raw: { 'FIR No': '2' } },
  { row_no: 3, status: 'error', messages: [{ level: 'error', field: 'fir_no', text: 'Bad number' }], raw: { 'FIR No': 'x' } },
  { row_no: 4, status: 'imported', messages: [], raw: null },
]

function stub(history: unknown[] = []) {
  const calls: { method: string; url: string; body?: unknown }[] = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body, text: async () => String(body) })
    if (url === '/api/stations') return ok([{ id: 's1', district: 'Demo District', name: 'Demo PS' }])
    if (url === '/api/imports/profiles') return ok([{ id: 'fir-generic', label: 'FIR list', fields: [{ name: 'fir_no', required: true }, { name: 'registered_at', required: true }, { name: 'status', required: false }] }])
    if (url === '/api/imports' && method === 'GET') return ok(history)
    if (url === '/api/imports/inspect') return ok({ headers: ['FIR No', 'Date', 'State'], suggested: { fir_no: 'FIR No' }, required: ['fir_no', 'registered_at'], rows: 3 })
    if (url === '/api/imports' && method === 'POST') return ok(batch(), 201)
    if (url.startsWith('/api/imports/b1/rows')) return ok(rows)
    if (url.endsWith('/errors.csv')) return ok('"row"')
    if (url.endsWith('/commit')) return ok(batch({ status: 'imported', rows_imported: 2, approved_by_name: 'SHO One', authority_note: 'Order 4/2026' }))
    if (url.endsWith('/discard')) return ok(batch({ status: 'discarded' }))
    if (url.endsWith('/undo')) return ok(batch({ status: 'undone' }))
    return ok([])
  }))
  return calls
}

async function chooseFile() {
  const file = new File(['FIR No,Date,State\n1,05/03/2024,open'], 'old.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => 'FIR No,Date,State\n1,05/03/2024,open' })
  await screen.findByRole('option', { name: 'Demo PS (Demo District)' })
  fireEvent.change(screen.getByLabelText('CSV file'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Read the file' }))
}

test('the file is read, columns matched, checked, filtered and approved with an authority', async () => {
  const calls = stub()
  render(<ImportPage />)
  await chooseFile()
  const match = await screen.findByRole('form', { name: 'Match the columns' })
  expect((within(match).getByLabelText('fir_no *') as HTMLSelectElement).value).toBe('FIR No')
  fireEvent.change(within(match).getByLabelText('registered_at *'), { target: { value: 'Date' } })
  fireEvent.change(within(match).getByLabelText('status'), { target: { value: 'State' } })
  fireEvent.change(within(match).getByLabelText('status'), { target: { value: '' } })
  fireEvent.click(within(match).getByRole('button', { name: 'Check the file' }))
  const result = await screen.findByLabelText('Result')
  expect(calls.find((c) => c.url === '/api/imports' && c.method === 'POST')?.body).toMatchObject({
    stationId: 's1', profile: 'fir-generic', complaintLanguage: 'en', filename: 'old.csv', mapping: { fir_no: 'FIR No', registered_at: 'Date' },
  })
  expect(within(result).getByText(/3 rows: 1 ready, 1 ready with something to check/)).toBeTruthy()
  expect(await within(result).findByText('Check: The General Diary entry is missing')).toBeTruthy()
  expect(within(result).getByText('Note: IPC 379 is BNS 303')).toBeTruthy()
  expect(within(result).getByText('removed after loading')).toBeTruthy()
  fireEvent.click(within(result).getByRole('button', { name: 'Will be skipped: error' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/imports/b1/rows?status=error')).toBe(true))
  fireEvent.click(within(result).getByRole('button', { name: 'Download the problems as CSV' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/imports/b1/errors.csv')).toBe(true))
  fireEvent.change(screen.getByLabelText(/Authority for this load/), { target: { value: 'Order 4/2026 of the Fictional SP' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and load 2 FIRs' }))
  expect(await screen.findByText(/Loaded 2 FIRs, approved by SHO One on the authority “Order 4\/2026”/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/commit'))?.body).toEqual({ authority: 'Order 4/2026 of the Fictional SP' })
  expect(screen.getByRole('status').textContent).toBe('The records were loaded.')
})

test('a batch can be discarded before approval', async () => {
  const calls = stub([batch()])
  render(<ImportPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open old.csv' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Discard this batch' }))
  expect((await screen.findByRole('status')).textContent).toBe('The batch was discarded.')
  expect(calls.some((c) => c.url.endsWith('/discard'))).toBe(true)
})

test('an imported batch in the history can be undone with a reason', async () => {
  const calls = stub([batch({ status: 'imported', rows_imported: 2, approved_by_name: 'SHO One' })])
  render(<ImportPage />)
  const form = await screen.findByRole('form', { name: 'Undo old.csv' })
  fireEvent.change(within(form).getByLabelText('Reason to undo old.csv'), { target: { value: 'Wrong file was chosen' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Undo old.csv' }))
  expect((await screen.findByRole('status')).textContent).toBe('The batch was undone and its FIRs removed.')
  expect(calls.find((c) => c.url.endsWith('/undo'))?.body).toEqual({ reason: 'Wrong file was chosen' })
})

test('problems are shown, not hidden: no file, a refused file and a refused approval', async () => {
  stub()
  render(<ImportPage />)
  await screen.findByRole('option', { name: 'Demo PS (Demo District)' })
  fireEvent.click(screen.getByRole('button', { name: 'Read the file' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Choose a CSV file.')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/imports/inspect') return { ok: false, status: 400, json: async () => ({ message: 'The file needs a header line and at least one row.' }) }
    if (url === '/api/stations') return { ok: true, status: 200, json: async () => [{ id: 's1', district: 'Demo District', name: 'Demo PS' }] }
    return { ok: true, status: 200, json: async () => (init?.method === 'GET' ? [] : {}) }
  }))
  render(<ImportPage />)
  await chooseFile()
  expect((await screen.findByRole('alert')).textContent).toBe('The file needs a header line and at least one row.')
})

test('an empty history says so, and a failed load shows the error', async () => {
  stub()
  render(<ImportPage />)
  expect(await screen.findByText('No file has been loaded yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
  render(<ImportPage />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})
