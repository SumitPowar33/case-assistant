// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ImportPage from './ImportPage'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', can_import: true } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const batch = (over: Record<string, unknown> = {}) => ({
  id: 'b1', entity: 'fir', station_name: 'Demo PS', filename: 'old.csv', status: 'staged', rows_total: 3, rows_ok: 1, rows_warning: 1, rows_error: 1, rows_duplicate: 0,
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
    if (url === '/api/imports/profiles') return ok([{ id: 'fir-generic', label: 'FIR list', entity: 'fir', fields: [{ name: 'fir_no', required: true }, { name: 'registered_at', required: true }, { name: 'status', required: false }] }])
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

test('an arrests batch is described as arrests, and its undo says so', async () => {
  const calls = stub([batch({ entity: 'arrest', status: 'imported', rows_imported: 2, approved_by_name: 'SHO One' })])
  render(<ImportPage />)
  const form = await screen.findByRole('form', { name: 'Undo old.csv' })
  fireEvent.change(within(form).getByLabelText('Reason to undo old.csv'), { target: { value: 'Wrong file was chosen' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Undo old.csv' }))
  expect((await screen.findByRole('status')).textContent).toBe('The batch was undone and its arrests removed.')
  expect(calls.some((c) => c.url.endsWith('/undo'))).toBe(true)
  cleanup()
  stub([batch({ entity: 'arrest' })])
  render(<ImportPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open old.csv' }))
  expect(await screen.findByRole('button', { name: 'Approve and load 2 arrests' })).toBeTruthy()
})

test('a chargesheets batch is described as chargesheets', async () => {
  stub([batch({ entity: 'chargesheet' })])
  render(<ImportPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open old.csv' }))
  expect(await screen.findByRole('button', { name: 'Approve and load 2 chargesheets' })).toBeTruthy()
})

test('an evidence batch is described as evidence items', async () => {
  stub([batch({ entity: 'evidence', status: 'imported', rows_imported: 2, approved_by_name: 'SHO One', authority_note: 'Fictional order 1' })])
  render(<ImportPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Open old.csv' }))
  expect(await screen.findByText(/Loaded 2 evidence items, approved by SHO One/)).toBeTruthy()
})

test('a state layout is offered only for stations of that state', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
    if (url === '/api/stations') return ok([{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo PS' },
      { id: 's2', state_code: 'MH', district: 'Demo Pune', name: 'Demo Pune PS' }])
    if (url === '/api/imports/profiles') return ok([{ id: 'fir-generic', label: 'FIR list', entity: 'fir', module: 'IN', fields: [] },
      { id: 'fir-mh', label: 'FIR list, MH made-up layout', entity: 'fir', module: 'MH', fields: [] }, { id: 'old', label: 'Older server', entity: 'fir', fields: [] }])
    return ok([])
  }))
  setSession({ token: 't', user: { id: 'u2', username: 'sho.pune', full_name: 'SHO Pune', rank: 'Insp', role: 'sho', station_id: 's2', can_import: true } })
  render(<ImportPage />)
  await screen.findByRole('option', { name: 'Demo PS (Demo District)' })
  const layout = screen.getByLabelText('File layout')
  expect((screen.getByLabelText('Police station') as HTMLSelectElement).value).toBe('s2')   // the user's own station first
  expect(within(layout).getByRole('option', { name: 'FIR list, MH made-up layout' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Police station'), { target: { value: 's1' } })
  expect(within(layout).queryByRole('option', { name: 'FIR list, MH made-up layout' })).toBeNull()
  expect(within(layout).getByRole('option', { name: 'Older server' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Police station'), { target: { value: 's2' } })
  expect(within(layout).getByRole('option', { name: 'FIR list, MH made-up layout' })).toBeTruthy()
  expect(within(layout).getByRole('option', { name: 'FIR list' })).toBeTruthy()
})

const inLang = (lang: string) => render(<ScreenLangContext.Provider value={lang}><ImportPage /></ScreenLangContext.Provider>)

test('in Marathi: every step, status, row result and the approval are in Marathi; server texts and file names stay as sent', async () => {
  const calls = stub()
  inLang('mr')
  expect(await screen.findByRole('heading', { name: 'विद्यमान नोंदी लोड करा' })).toBeTruthy()
  expect(screen.getByText('अद्याप कोणतीही फाइल लोड झालेली नाही.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'फाइल वाचा' }))
  expect((await screen.findByRole('alert')).textContent).toBe('CSV फाइल निवडा.')
  const file = new File(['x'], 'old.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'text', { value: async () => 'FIR No,Date,State\n1,05/03/2024,open' })
  fireEvent.change(screen.getByLabelText('CSV फाइल'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'फाइल वाचा' }))
  const match = await screen.findByRole('form', { name: 'स्तंभ जुळवा' })
  expect(within(match).getByText(/^3 ओळी\./)).toBeTruthy()
  expect(within(match).getAllByRole('option', { name: '(फाइलमध्ये नाही)' }).length).toBe(3)
  fireEvent.change(within(match).getByLabelText('registered_at *'), { target: { value: 'Date' } })   // field names of the layout stay as they are
  fireEvent.click(within(match).getByRole('button', { name: 'फाइल तपासा' }))
  const result = await screen.findByLabelText('निकाल')
  expect(within(result).getByRole('heading', { name: '3. old.csv चा निकाल' })).toBeTruthy()
  expect(within(result).getByText('मंजुरीच्या प्रतीक्षेत. 3 ओळी: 1 तयार, 1 तयार पण काही तपासायचे, 1 चुका असलेल्या (वगळल्या), 0 प्रणालीत आधीच (वगळल्या).')).toBeTruthy()
  expect(await within(result).findByText('तपासा: The General Diary entry is missing')).toBeTruthy()   // the check itself comes from the server in English
  expect(within(result).getByText('टीप: IPC 379 is BNS 303')).toBeTruthy()
  expect(within(result).getByText('चूक: Bad number')).toBeTruthy()
  expect(within(result).getByText('लोड केल्यानंतर काढले')).toBeTruthy()
  for (const name of ['सर्व ओळी', 'तयार', 'तयार, तपासा', 'वगळली जाईल: चूक', 'वगळली: आधीच आहे']) expect(within(result).getByRole('button', { name })).toBeTruthy()
  expect(within(result).getAllByText('लोड केले').length).toBe(1)   // the row already imported
  fireEvent.change(screen.getByLabelText(/या लोडचा अधिकार/), { target: { value: 'Order 4/2026 of the Fictional SP' } })
  fireEvent.click(screen.getByRole('button', { name: 'मंजुरी द्या आणि 2 एफआयआर लोड करा' }))
  expect(await screen.findByText('2 एफआयआर लोड केले, SHO One यांच्या मंजुरीने, “Order 4/2026” या अधिकारावर.')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('नोंदी लोड झाल्या.')
  expect(calls.find((c) => c.url.endsWith('/commit'))?.body).toEqual({ authority: 'Order 4/2026 of the Fictional SP' })
})

test('in Hindi: the history, undo and discard; an unknown status or kind from the server shows its code', async () => {
  stub([batch({ entity: 'notice', status: 'imported', rows_imported: 2, approved_by_name: 'SHO One' }), batch({ id: 'b2', filename: 'odd.csv', status: 'archived' }), batch({ id: 'b3', filename: 'new.csv', entity: 'witness_list' })])
  inLang('hi')
  const form = await screen.findByRole('form', { name: 'old.csv पूर्ववत करें' })
  for (const name of ['फ़ाइल', 'थाना', 'स्थिति', 'पंक्तियाँ', 'किसने तैयार किया']) expect(screen.getByRole('columnheader', { name })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'लोड किया गया' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'archived' })).toBeTruthy()
  fireEvent.change(within(form).getByLabelText('old.csv पूर्ववत करने का कारण'), { target: { value: 'Wrong file was chosen' } })
  fireEvent.click(within(form).getByRole('button', { name: 'old.csv पूर्ववत करें' }))
  expect((await screen.findByRole('status')).textContent).toBe('बैच पूर्ववत किया गया और उसके नोटिस हटा दिए गए।')
  fireEvent.click(screen.getByRole('button', { name: 'new.csv खोलें' }))
  expect(await screen.findByRole('button', { name: 'स्वीकृति दें और 2 witness_list लोड करें' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'यह बैच रद्द करें' }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('बैच रद्द कर दिया गया।'))
})

test('a refused check, a failed download and a refused approval are shown, and nothing is claimed loaded', async () => {
  const refuse = (message: string, status = 409) => ({ ok: false, status, json: async () => ({ message }), text: async () => '' })
  let refused = 'check'
  const base = stub()
  const inner = vi.mocked(fetch).getMockImplementation()!
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/imports' && init?.method === 'POST' && refused === 'check') return refuse('The layout fir-generic needs registered_at.', 400)
    if (url.endsWith('/errors.csv')) return refuse('', 500)
    if (url.endsWith('/commit')) return refuse('A second authorised person must approve this import.')
    return inner(url, init)
  }))
  render(<ImportPage />)
  await chooseFile()
  const match = await screen.findByRole('form', { name: 'Match the columns' })
  fireEvent.click(within(match).getByRole('button', { name: 'Check the file' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The layout fir-generic needs registered_at.')
  expect(screen.getByRole('form', { name: 'Match the columns' })).toBeTruthy()   // the matching stays to be corrected
  refused = ''
  fireEvent.click(within(match).getByRole('button', { name: 'Check the file' }))
  const result = await screen.findByLabelText('Result')
  fireEvent.click(within(result).getByRole('button', { name: 'Download the problems as CSV' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/500/)
  fireEvent.change(screen.getByLabelText(/Authority for this load/), { target: { value: 'Order 4/2026 of the Fictional SP' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve and load 2 FIRs' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('A second authorised person must approve this import.'))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('form', { name: 'Approve' })).toBeTruthy()   // still waiting for approval
  expect(base.length).toBeGreaterThan(0)
})
