// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CaseDiary from './CaseDiary'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const today = {
  date: '2026-11-02', today: true, page: null,
  entries: [{ at: '2026-11-02T04:30:00Z', text: 'Visited the fictional bank branch.', author_name: 'SI Fictional' }],
  events: [{ at: '2026-11-02T05:35:00Z', what: 'notice_sent', detail: 'BNSS_94 · Nodal Officer, Fictional Bank' }],
  days: [{ diary_date: '2026-11-02', page_no: null }, { diary_date: '2026-11-01', page_no: 1 }],
}
const closedDay = { ...today, date: '2026-11-01', today: false, page: { page_no: 1, closed_at: '2026-11-01T13:00:00Z', closed_by_name: 'SI Fictional' }, events: [] }

function stub(write: { status: number; body: unknown } = { status: 201, body: {} }) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => write.body }
    return { ok: true, status: 200, json: async () => (url.includes('date=2026-11-01') ? closedDay : today) }
  }))
  return calls
}

test("today's page shows the officer's entries and the app's own steps in time order, takes a new entry and can be closed", async () => {
  const calls = stub()
  render(<CaseDiary firId="f1" />)
  expect(await screen.findByText('Visited the fictional bank branch.')).toBeTruthy()
  expect(screen.getByText('Notice sent: BNSS_94 · Nodal Officer, Fictional Bank')).toBeTruthy()
  expect(screen.getByText('From app')).toBeTruthy()
  expect(screen.getByText('10:00')).toBeTruthy()                    // India time
  fireEvent.change(screen.getByLabelText('Add what you saw or learnt'), { target: { value: 'The manager will give the CCTV tomorrow.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/firs/f1/diary')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ text: 'The manager will give the CCTV tomorrow.' })
  fireEvent.click(screen.getByRole('button', { name: "Close today's page" }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/firs/f1/diary/close')).toBe(true))
})

test('an earlier, closed page is read only; a refusal from the server is shown', async () => {
  stub({ status: 409, body: { message: "Today's page of the case diary is already closed." } })
  render(<CaseDiary firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: "Close today's page" }))
  expect((await screen.findByRole('alert')).textContent).toContain('already closed')
  fireEvent.click(screen.getByRole('button', { name: '2026-11-01 · page 1' }))
  expect(await screen.findByText(/Page 1 closed/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Back to today' }))
  expect(await screen.findByRole('button', { name: 'Add entry' })).toBeTruthy()
})

test('a page that cannot be read says why', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  render(<CaseDiary firId="f1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})
