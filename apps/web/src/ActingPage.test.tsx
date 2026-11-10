// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ActingPage from './ActingPage'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sp.one', full_name: 'SP One', rank: 'SP', role: 'sp', station_id: 's1', permissions: ['acting.grant'] } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const stations = [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo North PS' }, { id: 's2', state_code: 'IN', district: 'Demo District', name: 'Demo South PS' }]
const options = { officers: [{ id: 'o1', full_name: 'SI Fictional Asha', rank: 'SI', role: 'io' }], roles: [{ code: 'sho', label: 'Station House Officer' }] }
const charge = (extra = {}) => ({ id: 'c1', full_name: 'SI Fictional Asha', rank: 'SI', role: 'sho', role_label: 'Station House Officer', reason: 'Fictional leave of the SHO', ends_at: '2026-11-20T18:29:59Z', status: 'running', ended_reason: null, ...extra })

function stub(charges: unknown[], post?: (url: string, body: unknown) => { status: number; body: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    let a = { status: 200, body: {} as unknown }
    if (method === 'POST') a = post ? post(url, calls[calls.length - 1].body) : { status: 201, body: {} }
    else if (url === '/api/stations') a = { status: 200, body: stations }
    else if (url.startsWith('/api/acting-charges/options')) a = { status: 200, body: options }
    else a = { status: 200, body: charges }
    return { ok: a.status < 300, status: a.status, json: async () => a.body }
  }))
  return calls
}

test('the page lists the charges of the own station with their state, and a station can be chosen', async () => {
  const calls = stub([charge(), charge({ id: 'c2', status: 'ended', ended_reason: 'Fictional: the SHO is back' })])
  render(<ActingPage />)
  expect(await screen.findAllByText('Holds Station House Officer until 20 Nov 2026, 11:59 pm IST')).toHaveLength(2)
  expect(screen.getByText('Running')).toBeTruthy()
  expect(screen.getByText('Ended early')).toBeTruthy()
  expect(screen.getByText('Ended early: Fictional: the SHO is back')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'End charge' })).toHaveLength(1)   // only a running charge can be ended
  fireEvent.change(screen.getByLabelText('Police station'), { target: { value: 's2' } })
  await waitFor(() => expect(calls.some((c) => c.url === '/api/acting-charges?stationId=s2')).toBe(true))
})

test('no charge shows a plain line; an account without a station starts with the first station', async () => {
  setSession({ token: 't', user: { id: 'u1', username: 'sa', full_name: 'SA', rank: 'SA', role: 'state_admin', station_id: null, permissions: ['acting.grant'] } })
  const calls = stub([])
  render(<ActingPage />)
  expect(await screen.findByText('No acting charge has been given at this station.')).toBeTruthy()
  expect(calls.some((c) => c.url === '/api/acting-charges?stationId=s1')).toBe(true)
})

test('giving a charge sends the officer, role, last day and reason, then the list loads again', async () => {
  const calls = stub([])
  render(<ActingPage />)
  await screen.findByRole('heading', { name: 'Give acting charge' })
  fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-11-20' } })
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Fictional leave of the SHO' } })
  fireEvent.click(screen.getByRole('button', { name: 'Give charge' }))
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ userId: 'o1', role: 'sho', endsOn: '2026-11-20', reason: 'Fictional leave of the SHO' }))
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/acting-charges?stationId=s1')).toHaveLength(2))
})

test('the server refusal is shown as it is, for giving and for ending', async () => {
  stub([charge()], (url) => ({ status: url.endsWith('/end') ? 409 : 403, body: { message: 'Fictional refusal from the server' } }))
  render(<ActingPage />)
  await screen.findByRole('heading', { name: 'Give acting charge' })
  fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-11-20' } })
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Fictional leave of the SHO' } })
  fireEvent.click(screen.getByRole('button', { name: 'Give charge' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Fictional refusal from the server')
  fireEvent.change(screen.getByLabelText('Reason for ending'), { target: { value: 'Fictional: the SHO is back' } })
  fireEvent.click(screen.getByRole('button', { name: 'End charge' }))
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
})

test('ending a charge sends its reason to that charge', async () => {
  const calls = stub([charge()])
  render(<ActingPage />)
  fireEvent.change(await screen.findByLabelText('Reason for ending'), { target: { value: '  Fictional: the SHO is back ' } })
  fireEvent.click(screen.getByRole('button', { name: 'End charge' }))
  await waitFor(() => expect(calls.find((c) => c.url === '/api/acting-charges/c1/end')?.body).toEqual({ reason: 'Fictional: the SHO is back' }))
})

test('a failed load is shown, for the stations and for the station page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
  render(<ActingPage />)
  expect((await screen.findByRole('alert')).textContent).toBe('The server answered 403 for /stations')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/stations'
    ? { ok: true, status: 200, json: async () => stations }
    : { ok: false, status: 403, json: async () => ({}) }))
  render(<ActingPage />)
  expect((await screen.findByRole('alert')).textContent).toContain('The server answered 403 for /acting-charges')
})
