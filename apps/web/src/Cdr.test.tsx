// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Cdr from './Cdr'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const analysis = { common: [{ number: '9000077777', targets: ['9000011111', '9000022222'], events: 3, person: null }], files: [{
  id: 'c1', evidence: 'E1', target: '9000011111', target_person: 'A1', filename: 'f.csv', lines: 4, skipped: 0, loaded_at: '2026-09-10T10:00:00Z',
  loaded_by: 'SI Fictional', first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-04T04:30:00Z',
  contacts: [{ other: '9000022222', calls: 2, sms: 0, seconds: 195, first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-03T18:10:00Z', person: 'A2' }],
  cells: [{ cell: '404-10-1234-5678', events: 2, first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-03T18:10:00Z' }],
  days: [{ day: '2026-09-03', events: 2 }] }] }

function stub(over: Record<string, { status: number; body: unknown }> = {}) {
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null })
    const key = `${init?.method ?? 'GET'} ${url}`
    const r = over[key] ?? (url.endsWith('/evidence') ? { status: 200, body: [{ id: 'e1', label: 'E1', kind: 'electronic' }, { id: 'e2', label: 'P1', kind: 'physical' }] }
      : url.endsWith('/cdr') ? { status: 200, body: analysis } : { status: 404, body: {} })
    return { ok: r.status < 300, status: r.status, json: async () => r.body }
  }))
  return calls
}

test('the analysis is read only when asked for, and shows contacts with labels, cells, days and shared numbers', async () => {
  const calls = stub()
  render(<Cdr firId="f1" />)
  await screen.findByText('Each view of the call records is logged.')
  expect(calls.some((c) => c.url.endsWith('/cdr'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Show the analysis' }))
  const card = await screen.findByRole('region', { name: 'E1: records of 9000011111 (A1)' })
  expect(within(card).getByRole('rowheader', { name: '9000022222 (A2)' })).toBeTruthy()
  expect(within(card).getByRole('rowheader', { name: '404-10-1234-5678' })).toBeTruthy()
  expect(within(card).getByText('2026-09-03: 2')).toBeTruthy()
  expect(screen.getByRole('rowheader', { name: '9000077777' })).toBeTruthy()
  expect(screen.getByText('9000011111, 9000022222')).toBeTruthy()
})

test('a file is sent with its bytes for the hash check, and the counts and unreadable lines are shown', async () => {
  const calls = stub({ 'POST /api/firs/f1/cdr': { status: 201, body: { id: 'c1', lines: 4, skipped: 1, problems: ['Line 6: date not readable'] } } })
  render(<Cdr firId="f1" />)
  const select = await screen.findByLabelText('Evidence item (the seized file)')
  expect(within(select).queryByText('P1')).toBeNull()   // physical items are not offered
  fireEvent.change(screen.getByLabelText('Number whose records these are'), { target: { value: '9000011111' } })
  const file = new File(['B Party No,Date,Duration,Call Type\n'], 'fictional.csv', { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('CDR file (CSV)'), { target: { files: [file] } })
  fireEvent.submit(screen.getByRole('button', { name: 'Load' }).closest('form')!)
  expect(await screen.findByText('4 records loaded, 1 lines could not be read. Line 6: date not readable')).toBeTruthy()
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.body).toMatchObject({ evidenceItemId: 'e1', target: '9000011111', filename: 'fictional.csv' })
  expect(atob(post.body!.contentBase64 as string)).toBe('B Party No,Date,Duration,Call Type\n')
})

test('the AI summary gets the table rows of this case and shows only sentences that name them', async () => {
  const calls = stub({ 'POST /ai/v1/generate': { status: 200, body: { request_id: 'r1', draft: 'A1 called A2 twice [T2]. A2 is guilty [T2]. Unsourced.' } } })
  render(<Cdr firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Show the analysis' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Summarise with AI' }))
  expect(await screen.findByText('A1 called A2 twice.')).toBeTruthy()
  expect(screen.queryByText(/guilty/)).toBeNull()
  expect(screen.getByText('2 sentences were left out: they named no table row or judged someone.')).toBeTruthy()
  const gen = calls.find((c) => c.url.endsWith('/generate'))!
  expect(gen.body).toMatchObject({ feature: 'cdr_summary', case_ref: 'f1' })
  expect(gen.body!.prompt as string).toContain('[T2] E1, records of 9000011111 (A1): 9000022222 (A2)')
  expect(gen.body!.prompt as string).not.toContain('SI Fictional')
})

test('no electronic item yet says to seize the file first; no files loaded says so', async () => {
  stub({ 'GET /api/firs/f1/evidence': { status: 200, body: [] }, 'GET /api/firs/f1/cdr': { status: 200, body: { files: [], common: [] } } })
  render(<Cdr firId="f1" />)
  expect(await screen.findByText(/Seize the operator's file first/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Show the analysis' }))
  expect(await screen.findByText('No call records loaded yet.')).toBeTruthy()
})
