// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ExpertRequests from './ExpertRequests'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const req = (over: object) => ({
  id: 'r1', fir_id: 'f1', fir_no: 7, fir_year: 2026, kind: 'forensic', subject: 'Phone extraction', withheld: false, sent_to: 'Fictional Lab', sent_on: '2026-10-01',
  station: 'Fictional PS', status: 'sent', note: null, days_waiting: 5, reminder_due: false, ...over,
})
const list = {
  requests: [
    req({}),
    req({ id: 'r2', kind: 'medical', subject: 'Injury report', sent_to: 'Fictional Hospital', status: 'at_lab', note: 'Queue 14', days_waiting: 40, reminder_due: true }),
    req({ id: 'r3', subject: 'Handwriting', status: 'report_received', days_waiting: null }),
    req({ id: 'r4', subject: 'Odd', status: 'weird' }),
  ],
  counts: { open: 3, reminder_due: 1, report_received: 1 },
}
const steps = [
  { id: 's1', status: 'sent', on_date: '2026-10-01', note: null },
  { id: 's2', status: 'at_lab', on_date: '2026-10-03', note: 'Queue 14' },
]

function stub(load: unknown = list, history: unknown = steps, write = { status: 201 }) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => ({ message: 'Only the case team can do this.' }) }
    if (url.startsWith('/api/firs?')) return { ok: true, status: 200, json: async () => [{ id: 'f1', fir_no: 7, fir_year: 2026 }] }
    return { ok: true, status: 200, json: async () => (url.includes('/steps') ? history : load) }
  }))
  return calls
}

test('the list shows each request with its case, newest step, days waiting, the reminder mark and the counts', async () => {
  stub()
  render(<ExpertRequests />)
  const table = await screen.findByRole('table', { name: 'Forensic and medical requests' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(5)
  expect(rows[1].textContent).toContain('FIR 7/2026')
  expect(rows[1].textContent).toContain('Forensic (lab)')
  expect(rows[1].textContent).toContain('5 days')
  expect(rows[2].textContent).toContain('Medical (hospital)')
  expect(rows[2].textContent).toContain('Queue 14')
  expect(within(rows[2]).getByText('Reminder due')).toBeTruthy()
  expect(rows[3].textContent).toContain('—')
  expect(within(rows[3]).getByText('Report received', { selector: '.chip' })).toBeTruthy()
  expect(rows[4].textContent).toContain('weird')   // a status the screen does not know is shown as it is
  expect(screen.getByText('Open: 3')).toBeTruthy()
  expect(screen.getByText('Reminder due: 1')).toBeTruthy()
  expect(screen.getByText('Report received: 1', { selector: '.chip' })).toBeTruthy()
})

test('an empty list says nothing yet, a missing count is zero and a failed read shows its error', async () => {
  stub({ requests: [], counts: {} })
  render(<ExpertRequests />)
  expect(await screen.findByText('None yet.')).toBeTruthy()
  expect(screen.getByText('Open: 0')).toBeTruthy()
  cleanup()
  stub({})   // an answer of another shape does not crash the screen
  render(<ExpertRequests />)
  expect(await screen.findByText('None yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<ExpertRequests />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})

test('picking a request shows its steps, oldest first, and a link to its case', async () => {
  stub()
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Phone extraction' }))
  const table = await screen.findByRole('table', { name: 'Steps of this request: Phone extraction' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1].textContent).toContain('2026-10-01')
  expect(rows[2].textContent).toContain('Received at lab or hospital')
  expect(rows[2].textContent).toContain('Queue 14')
  expect(screen.getByRole('link', { name: 'Open FIR 7/2026' }).getAttribute('href')).toBe('#/firs/f1')
})

test('a step is sent to the steps route of the request, then the list is read again', async () => {
  const calls = stub()
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Injury report' }))
  const form = (await screen.findByRole('heading', { name: 'Record the next step' })).closest('form')!
  const field = (label: string) => within(form).getByLabelText(new RegExp(label))
  fireEvent.change(field('Status'), { target: { value: 'report_received' } })
  fireEvent.change(field('Date'), { target: { value: '2026-10-20' } })
  fireEvent.change(field('Note'), { target: { value: '  e-signed  ' } })
  fireEvent.submit(form)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/firs/f1/expert-requests/r2/steps')
  expect(post.body).toEqual({ status: 'report_received', date: '2026-10-20', note: 'e-signed' })
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/expert-requests').length).toBeGreaterThan(1))
})

test('the reason is shown when the server refuses a step; a request with its report in has no step form', async () => {
  stub(list, steps, { status: 403 })
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Phone extraction' }))
  const form = (await screen.findByRole('heading', { name: 'Record the next step' })).closest('form')!
  fireEvent.submit(form)
  expect((await screen.findByRole('alert')).textContent).toContain('Only the case team can do this.')
  fireEvent.click(screen.getByRole('button', { name: 'Handwriting' }))
  await screen.findByRole('table', { name: 'Steps of this request: Handwriting' })
  expect(screen.queryByRole('heading', { name: 'Record the next step' })).toBeNull()
})

test('a failed read of the steps shows its error', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/steps')
    ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => (url.startsWith('/api/firs?') ? [] : list) }))
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Phone extraction' }))
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})

test('a new request is sent to the chosen case, and a refusal shows its reason', async () => {
  const calls = stub()
  render(<ExpertRequests />)
  const form = (await screen.findByRole('heading', { name: 'New request' })).closest('form')!
  await within(form).findByRole('option', { name: 'FIR 7/2026' })
  const field = (label: string) => within(form).getByLabelText(new RegExp(label))
  fireEvent.change(field('Case'), { target: { value: 'f1' } })
  fireEvent.change(field('Kind'), { target: { value: 'medical' } })
  fireEvent.change(field('What is asked'), { target: { value: '  MLC report ' } })
  fireEvent.change(field('Sent to'), { target: { value: 'Fictional Hospital' } })
  fireEvent.change(field('Date'), { target: { value: '2026-10-21' } })
  fireEvent.submit(form)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/firs/f1/expert-requests')
  expect(post.body).toEqual({ kind: 'medical', subject: 'MLC report', sentTo: 'Fictional Hospital', date: '2026-10-21' })
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/expert-requests').length).toBeGreaterThan(1))
  cleanup()
  stub(list, steps, { status: 403 })
  render(<ExpertRequests />)
  const again = (await screen.findByRole('heading', { name: 'New request' })).closest('form')!
  fireEvent.submit(again)
  expect((await within(again).findByRole('alert')).textContent).toContain('Only the case team can do this.')
})

test('the case list of the new-request form tolerates an answer of another shape', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.startsWith('/api/firs?') ? {} : list) })))
  render(<ExpertRequests />)
  expect(await screen.findByRole('option', { name: 'Choose a case' })).toBeTruthy()
})

test('the subject of a request of a protected case is shown as withheld, in the list and over its steps', async () => {
  stub({ ...list, requests: [req({ subject: null, withheld: true })] })
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Withheld (BNS 72)' }))
  expect(await screen.findByRole('heading', { name: 'Steps of this request: Withheld (BNS 72)' })).toBeTruthy()
})
