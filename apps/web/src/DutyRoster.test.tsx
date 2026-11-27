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

test('a court date the roster does not allow for is listed with the officer\'s entry, and nothing is listed otherwise', async () => {
  const clash = (extra = {}) => ({ officer_id: 'o1', full_name: 'SI Fictional Asha', rank: 'SI', on_date: '2026-11-26', kind: 'leave', shift: null, post: null, fir_id: 'f1', fir_no: 11, fir_year: 2026, ...extra })
  stub(roster({ court_clashes: [clash(), clash({ fir_id: 'f2', fir_no: 12, kind: 'duty', shift: 'evening', post: 'beat' }), clash({ fir_id: 'f3', fir_no: 13, kind: null })] }))
  const { unmount } = render(<DutyRoster />)
  expect(await screen.findByRole('heading', { name: 'Court dates to check (3)' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Court date in FIR 11/2026' }).getAttribute('href')).toBe('#/court')
  expect(screen.getByText('Investigating officer SI Fictional Asha (SI) is rostered: Leave')).toBeTruthy()
  expect(screen.getByText('Investigating officer SI Fictional Asha (SI) is rostered: Evening (2 pm to 10 pm), Beat')).toBeTruthy()
  expect(screen.getByText('Investigating officer SI Fictional Asha (SI) has nothing on the roster that day')).toBeTruthy()
  unmount()
  stub(roster({ court_clashes: [] }))
  render(<DutyRoster />)
  await screen.findByRole('heading', { name: 'Next 31 days' })
  expect(screen.queryByRole('heading', { name: /Court dates to check/ })).toBeNull()
})

const swap = (extra = {}) => ({ id: 'w1', state: 'waiting',
  give_officer_id: 'u1', give_name: 'SI Fictional Asha', give_rank: 'SI', give_date: '2026-11-25', give_shift: 'morning', give_post: 'beat',
  take_officer_id: 'o2', take_name: 'SI Fictional Bela', take_rank: 'SI', take_date: '2026-11-26', take_shift: 'night', take_post: 'lock_up',
  reason: 'Fictional family function', note: null, decided_by: null, ...extra })

test('an officer asks to exchange their own duty for a colleague\'s, and the server\'s refusal is shown', async () => {
  let refuse = false
  const calls = stub(roster({ can_manage: false, rows: [row({ officer_id: 'u1' }), row({ id: 'a3', officer_id: 'o2', full_name: 'SI Fictional Bela', shift: 'night', post: 'lock_up' })] }),
    () => refuse ? { status: 409, body: { message: 'One of these duties is already in a request that waits for a decision.' } } : { status: 201, body: {} })
  render(<DutyRoster />)
  expect(await screen.findByRole('heading', { name: 'Ask for a swap' })).toBeTruthy()
  expect([...(screen.getByLabelText('My duty') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['a1'])
  expect([...(screen.getByLabelText('In exchange for') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['a3'])
  fireEvent.change(screen.getByLabelText('Why (at least 10 characters)'), { target: { value: ' Fictional family function ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send the request' }))
  await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/duty-roster/swaps', method: 'POST', body: { giveId: 'a1', takeId: 'a3', reason: 'Fictional family function' } }))
  refuse = true
  await screen.findByRole('button', { name: 'Send the request' })
  fireEvent.change(screen.getByLabelText('Why (at least 10 characters)'), { target: { value: 'Fictional family function' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send the request' }))
  expect(await screen.findByText('One of these duties is already in a request that waits for a decision.')).toBeTruthy()
})

test('the officer in charge approves or refuses a waiting request; a lapsed one can only be refused', async () => {
  let n = 0
  const calls = stub(roster({ rows: [], swaps: [swap(), swap({ id: 'w2', state: 'lapsed' })] }),
    () => n++ === 0 ? { status: 400, body: { message: 'Say why the swap is refused (at least 10 characters).' } } : { status: 204, body: {} })
  render(<DutyRoster />)
  expect(await screen.findByRole('heading', { name: 'Swap requests' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Ask for a swap' })).toBeNull()
  expect(screen.getByText('Waiting for the officer in charge')).toBeTruthy()
  expect(screen.getByText('Lapsed: a duty has passed or been taken back')).toBeTruthy()
  expect(screen.getAllByText('SI Fictional Asha (SI), 2026-11-25: Morning (6 am to 2 pm), Beat, to be exchanged for SI Fictional Bela (SI), 2026-11-26: Night (10 pm to 6 am), Lock-up guard')).toHaveLength(2)
  expect(screen.getAllByText('Reason: Fictional family function')).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: 'Approve the swap' })).toHaveLength(1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Refuse' })[1])
  expect(await screen.findByText('Say why the swap is refused (at least 10 characters).')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/duty-roster/swaps/w2/decision', method: 'POST', body: { approve: false, note: null } })
  fireEvent.change(screen.getAllByLabelText('Note (needed to refuse, at least 10 characters)')[0], { target: { value: ' Fictional agreed ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve the swap' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/duty-roster/swaps/w1/decision' && JSON.stringify(c.body) === JSON.stringify({ approve: true, note: 'Fictional agreed' }))).toBe(true))
})

test('a decided request shows its answer to a reader, with nothing to press; a reason not told is not shown', async () => {
  stub(roster({ rows: [], can_manage: false, swaps: [swap({ state: 'refused', reason: null, note: 'Fictional bandobast that day', decided_by: 'PI Fictional Chetan' }), swap({ id: 'w3', state: 'approved' }), swap({ id: 'w4' })] }))
  render(<DutyRoster />)
  expect(await screen.findByText('Refused')).toBeTruthy()
  expect(screen.getByText('Approved')).toBeTruthy()
  expect(screen.getByText('Note: Fictional bandobast that day')).toBeTruthy()
  expect(screen.getByText('Decided by PI Fictional Chetan')).toBeTruthy()
  expect(screen.getAllByText(/^Reason: /)).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Refuse' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Ask for a swap' })).toBeNull()
})
