// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DutyRoster from './DutyRoster'
import { setSession } from './api'

// Fictional data only.
const user = { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'PI', role: 'sho', station_id: 's1', permissions: ['roster.manage'] }
beforeEach(() => setSession({ token: 't', user }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const row = (extra = {}) => ({ id: 'a1', officer_id: 'o1', full_name: 'SI Fictional Asha', rank: 'SI', on_date: '2026-11-24', kind: 'duty', shift: 'morning', post: 'front_desk', note: null, ...extra })
const roster = (extra = {}) => ({ from: '2026-11-24', rows: [row(), row({ id: 'a2', full_name: 'SI Fictional Bela', kind: 'leave', shift: null, post: null, note: 'Fictional wedding' })], now: { shift: 'morning', on_duty: [row()] }, can_manage: true, ...extra })

function stub(data: unknown, post?: (url: string, body: unknown) => { status: number; body: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    let a = { status: 200, body: data as unknown }
    if (method === 'POST') a = post ? post(url, calls[calls.length - 1].body) : { status: 201, body: {} }
    else if (url.startsWith('/api/duty-roster/options')) a = { status: 200, body: [{ id: 'o1', full_name: 'SI Fictional Asha', rank: 'SI' }] }
    return { ok: a.status < 300, status: a.status, json: async () => a.body }
  }))
  return calls
}

test('the page shows who is on duty now and the days of the roster, with leave named', async () => {
  stub(roster())
  render(<DutyRoster />)
  expect(await screen.findByText('On duty now (Morning (6 am to 2 pm) shift)')).toBeTruthy()
  expect(screen.getAllByText(/SI Fictional Asha \(SI\): Front desk/).length).toBeGreaterThan(0)
  expect(screen.getByText('2026-11-24')).toBeTruthy()
  expect(screen.getByText(/SI Fictional Bela \(SI\): Leave/)).toBeTruthy()
  expect(screen.getByText(/Fictional wedding/)).toBeTruthy()
})

test('nobody on duty and an empty roster say so; a plain officer sees no form and no take-back', async () => {
  stub(roster({ rows: [], now: { shift: 'night', on_duty: [] }, can_manage: false }))
  render(<DutyRoster />)
  expect(await screen.findByText('Nobody is rostered for this shift.')).toBeTruthy()
  expect(screen.getByText('No entries yet.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull()
})

test('the officer in charge writes a duty (shift and post sent) and a leave (neither sent)', async () => {
  const calls = stub(roster())
  render(<DutyRoster />)
  await screen.findByRole('button', { name: 'Save entry' })
  await waitFor(() => expect(screen.getByLabelText('Officer')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-25' } })
  fireEvent.change(screen.getByLabelText('Shift'), { target: { value: 'night' } })
  fireEvent.change(screen.getByLabelText('Post'), { target: { value: 'lock_up' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ stationId: 's1', officerId: 'o1', date: '2026-11-25', kind: 'duty', shift: 'night', post: 'lock_up', note: null }))
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'leave' } })
  expect(screen.queryByLabelText('Shift')).toBeNull()
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-26' } })
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: ' Fictional ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
  await waitFor(() => expect(calls.filter((c) => c.method === 'POST')[1].body).toEqual({ stationId: 's1', officerId: 'o1', date: '2026-11-26', kind: 'leave', shift: null, post: null, note: 'Fictional' }))
})

test('the server\'s refusal is shown, and a take-back sends its reason', async () => {
  const calls = stub(roster(), (url) => url === '/api/duty-roster' ? { status: 409, body: { message: 'The officer already has an entry that day for this shift.' } } : { status: 204, body: {} })
  render(<DutyRoster />)
  await screen.findByRole('button', { name: 'Save entry' })
  await waitFor(() => expect(screen.getByLabelText('Officer')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
  expect(await screen.findByText('The officer already has an entry that day for this shift.')).toBeTruthy()
  fireEvent.change(screen.getAllByLabelText('Reason for taking it back')[0], { target: { value: ' Sent to court that day ' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Take back' })[0])
  await waitFor(() => expect(calls.some((c) => c.url === '/api/duty-roster/a1/cancel' && (c.body as { reason: string }).reason === 'Sent to court that day')).toBe(true))
})

test('a refused take-back shows the server\'s reason; an account without a station and a failed load say so', async () => {
  stub(roster(), (url) => url.endsWith('/cancel') ? { status: 409, body: { message: 'This entry has already been taken back.' } } : { status: 201, body: {} })
  render(<DutyRoster />)
  await screen.findByRole('button', { name: 'Save entry' })
  fireEvent.change(screen.getAllByLabelText('Reason for taking it back')[0], { target: { value: 'Sent to court that day' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Take back' })[0])
  expect(await screen.findByText('This entry has already been taken back.')).toBeTruthy()
  cleanup()
  setSession({ token: 't', user: { ...user, station_id: null as unknown as string } })
  render(<DutyRoster />)
  expect(screen.getByText('Your account is not posted at a police station.')).toBeTruthy()
  cleanup()
  setSession({ token: 't', user })
  stub({ message: 'Only officers of this police station, and those who run its roster, see it.' })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Only officers of this police station, and those who run its roster, see it.' }) })))
  render(<DutyRoster />)
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a duty row without a shift or post still lists, and a failed officer list shows its reason instead of the form', async () => {
  stub(roster({ rows: [row({ shift: null, post: null })], now: { shift: 'morning', on_duty: [row({ post: null })] } }))
  render(<DutyRoster />)
  expect(await screen.findAllByText(/SI Fictional Asha \(SI\)/)).toHaveLength(2)
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/duty-roster/options')
    ? { ok: false, status: 403, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => roster() }))
  render(<DutyRoster />)
  expect(await screen.findByText('The server answered 403 for /duty-roster/options?stationId=s1')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save entry' })).toBeNull()
})
