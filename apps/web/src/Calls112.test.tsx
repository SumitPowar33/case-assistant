// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Calls112 from './Calls112'
import { setSession } from './api'

// Fictional data only.
const user = { id: 'u1', username: 'desk.one', full_name: 'Desk One', rank: 'HC', role: 'front_desk', station_id: 's1', permissions: ['call112.handle'] }
beforeEach(() => setSession({ token: 't', user }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const row = (extra = {}) => ({
  id: 'e1', received_at: '2026-11-25T09:00:00+05:30', place: 'Fictional Chowk', kind: 'dispute', vehicle: 'Fictional Van 3', caller_name: 'Fictional Caller', caller_contact: '9000000000',
  details: 'Fictional dispute over a cart.', withheld: false, entered_by_name: 'Desk One', acknowledged_at: null, acknowledged_by_name: null, complaint_id: null, diary_no: null, sent: [], ...extra,
})

function stub(data: unknown, post?: (url: string, body: unknown) => { status: number; body: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    let a = { status: 200, body: data as unknown }
    if (method === 'POST') a = post ? post(url, calls[calls.length - 1].body) : { status: 201, body: {} }
    else if (url === '/api/complaint-kinds') a = { status: 200, body: [{ id: 'cyber_financial_fraud', label: 'Online fraud' }] }
    return { ok: a.status < 300, status: a.status, json: async () => a.body }
  }))
  return calls
}

test('the list shows each event, who wrote it and whether it was acknowledged or opened', async () => {
  stub({ can_handle: false, rows: [
    row(), row({ id: 'e2', caller_name: null, caller_contact: null, vehicle: null, acknowledged_at: '2026-11-25T09:05:00+05:30', acknowledged_by_name: 'Sho One', complaint_id: 'c1' }),
    row({ id: 'e3', acknowledged_at: '2026-11-25T09:05:00+05:30', acknowledged_by_name: 'Sho One', diary_no: 7 }),
    row({ id: 'e4', kind: 'woman_in_distress', withheld: true, caller_name: null, caller_contact: null, details: null }),
  ] })
  render(<Calls112 />)
  expect(await screen.findByRole('heading', { name: 'Incoming 112 events' })).toBeTruthy()
  expect(screen.getAllByText(/Fictional Caller, 9000000000: Fictional dispute over a cart./)).toHaveLength(2)
  expect(screen.getByText('Entered as general diary entry no. 7')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Opened as a complaint at the front desk' }).getAttribute('href')).toBe('#/complaints/c1')
  expect(screen.getByText(/Caller and details are shown only to the officer who wrote this event/)).toBeTruthy()
  expect(screen.getAllByText(/Acknowledged by Sho One/)).toHaveLength(2)
  expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()   // a reader who does not handle events has no buttons
  expect(screen.queryByRole('form')).toBeNull()
})

test('an empty station says so, and an account without a station is told', async () => {
  stub({ can_handle: true, rows: [] })
  const { unmount } = render(<Calls112 />)
  expect(await screen.findByText('No 112 events yet.')).toBeTruthy()
  unmount()
  setSession({ token: 't', user: { ...user, station_id: null } })
  render(<Calls112 />)
  expect(screen.getByText('Your account is not posted at a police station.')).toBeTruthy()
})

test('a failed load is shown as an error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
  render(<Calls112 />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})

test('the duty officer writes an event in India time and it is sent as written', async () => {
  const calls = stub({ can_handle: true, rows: [] })
  render(<Calls112 />)
  const form = (await screen.findByRole('heading', { name: 'Write down a 112 call' })).closest('form')!
  const q = within(form)
  fireEvent.change(q.getByLabelText('Time received'), { target: { value: '2026-11-25T09:00' } })
  fireEvent.change(q.getByLabelText('Place'), { target: { value: ' Fictional Chowk ' } })
  fireEvent.change(q.getByLabelText('Kind of call'), { target: { value: 'accident' } })
  fireEvent.change(q.getByLabelText('What the caller said'), { target: { value: 'Fictional crash' } })
  fireEvent.submit(form)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/calls-112', body: {
    stationId: 's1', receivedAt: '2026-11-25T09:00:00+05:30', place: 'Fictional Chowk', kind: 'accident', vehicle: null, callerName: null, callerContact: null, details: 'Fictional crash' } })
})

test('a refused event shows the reason and the form keeps what was typed', async () => {
  stub({ can_handle: true, rows: [] }, () => ({ status: 400, body: { message: 'The time received is in the future.' } }))
  render(<Calls112 />)
  const form = (await screen.findByRole('heading', { name: 'Write down a 112 call' })).closest('form')!
  const q = within(form)
  fireEvent.change(q.getByLabelText('Time received'), { target: { value: '2026-11-25T09:00' } })
  fireEvent.change(q.getByLabelText('Place'), { target: { value: 'Fictional Chowk' } })
  fireEvent.change(q.getByLabelText('What the caller said'), { target: { value: 'x' } })
  fireEvent.submit(form)
  expect((await within(form).findByRole('alert')).textContent).toContain('in the future')
  expect((q.getByLabelText('Place') as HTMLInputElement).value).toBe('Fictional Chowk')
})

test('a bad time typed is shown as an error, not sent', async () => {
  const calls = stub({ can_handle: true, rows: [] })
  render(<Calls112 />)
  const form = (await screen.findByRole('heading', { name: 'Write down a 112 call' })).closest('form')!
  fireEvent.change(within(form).getByLabelText('Place'), { target: { value: 'Fictional Chowk' } })
  fireEvent.change(within(form).getByLabelText('What the caller said'), { target: { value: 'x' } })
  fireEvent.submit(form)
  expect((await within(form).findByRole('alert')).textContent).toBe('Give the date and time.')
  expect(calls.some((c) => c.method === 'POST')).toBe(false)
})

test('the duty officer acknowledges an event and sees a refusal in words', async () => {
  const calls = stub({ can_handle: true, rows: [row()] }, () => ({ status: 409, body: { message: 'This event has already been acknowledged.' } }))
  render(<Calls112 />)
  fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }))
  expect((await screen.findByRole('alert')).textContent).toContain('already been acknowledged')
  expect(calls.find((c) => c.method === 'POST')?.url).toBe('/api/calls-112/e1/acknowledge')
})

test('an acknowledged event opens as a complaint with its kind and language, or as a diary entry', async () => {
  const calls = stub({ can_handle: true, rows: [row({ acknowledged_at: '2026-11-25T09:05:00+05:30', acknowledged_by_name: 'Sho One' })] })
  render(<Calls112 />)
  const asComplaint = await screen.findByRole('button', { name: 'Open as a complaint' })
  expect((asComplaint as HTMLButtonElement).disabled).toBe(true)   // a kind must be chosen first
  await screen.findByRole('option', { name: 'Online fraud' })
  fireEvent.change(screen.getByLabelText('Kind of complaint'), { target: { value: 'cyber_financial_fraud' } })
  fireEvent.change(screen.getByLabelText('Language of the details'), { target: { value: 'mr' } })
  fireEvent.click(asComplaint)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/calls-112/e1/open', body: { as: 'complaint', complaintKind: 'cyber_financial_fraud', textLanguage: 'mr' } })
  fireEvent.click(screen.getByRole('button', { name: 'Enter in the general diary' }))
  await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2))
  expect(calls.filter((c) => c.method === 'POST')[1]).toMatchObject({ url: '/api/calls-112/e1/open', body: { as: 'diary' } })
})

const officer = (officer_id: string, full_name: string, post: string) => ({ id: `d-${officer_id}`, officer_id, full_name, rank: 'HC', post })

/** The events list and, for the duty officer, the roster's "on duty now". */
function stubRoster(data: unknown, onDuty: unknown[], post?: () => { status: number; body: unknown }) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    const a = method === 'POST' ? post?.() ?? { status: 204, body: {} }
      : { status: 200, body: url.startsWith('/api/duty-roster') ? { now: { shift: 'morning', on_duty: onDuty } } : url === '/api/complaint-kinds' ? [] : data }
    return { ok: a.status < 300, status: a.status, json: async () => a.body }
  }))
  return calls
}

test('an acknowledged event is sent to a chosen beat or patrol officer on duty now, not to others or twice', async () => {
  const acknowledged = { acknowledged_at: '2026-11-25T09:05:00+05:30', acknowledged_by_name: 'Desk One' }
  const calls = stubRoster({ can_handle: true, rows: [row({ ...acknowledged, sent: [{ officer_id: 'o1', full_name: 'Fictional Beat', rank: 'HC', sent_at: '2026-11-25T09:06:00+05:30', to_you: false }] })] },
    [officer('o1', 'Fictional Beat', 'beat'), officer('o2', 'Fictional Patrol', 'patrol'), officer('o3', 'Fictional House', 'station_house')])
  render(<Calls112 />)
  const to = await screen.findByLabelText('Officer on beat or patrol') as HTMLSelectElement
  expect([...to.options].map((o) => o.textContent)).toEqual(['—', 'Fictional Patrol (HC): Patrolling vehicle'])
  expect(screen.getByText(/^Sent to Fictional Beat \(HC\) on /)).toBeTruthy()
  expect(screen.getByText(/shown in the app only/)).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Send to this officer' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.change(to, { target: { value: 'o2' } })
  fireEvent.click(button)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/calls-112/e1/send', method: 'POST', body: { officerId: 'o2' } })
})

test('no send control before the acknowledgement or with nobody left to send to, and the server\'s refusal is shown', async () => {
  const acknowledged = { acknowledged_at: '2026-11-25T09:05:00+05:30', acknowledged_by_name: 'Desk One' }
  stubRoster({ can_handle: true, rows: [row()] }, [officer('o1', 'Fictional Beat', 'beat')])
  render(<Calls112 />)
  await screen.findByRole('button', { name: 'Acknowledge' })
  expect(await screen.findByText(/Fictional Beat/)).toBeTruthy()
  expect(screen.queryByLabelText('Officer on beat or patrol')).toBeNull()
  cleanup()
  stubRoster({ can_handle: true, rows: [row(acknowledged)] }, [officer('o3', 'Fictional House', 'station_house')])
  render(<Calls112 />)
  await screen.findByRole('button', { name: 'Enter in the general diary' })
  await screen.findByText('Nobody is rostered for beat or patrol in this shift.')
  expect(screen.queryByLabelText('Officer on beat or patrol')).toBeNull()
  cleanup()
  stubRoster({ can_handle: true, rows: [row(acknowledged)] }, [officer('o1', 'Fictional Beat', 'beat')],
    () => ({ status: 400, body: { message: 'That officer is not on beat or patrol duty now.' } }))
  render(<Calls112 />)
  fireEvent.change(await screen.findByLabelText('Officer on beat or patrol'), { target: { value: 'o1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send to this officer' }))
  expect((await screen.findByRole('alert')).textContent).toContain('not on beat or patrol duty now')
})

test('an officer reads that an event was sent to them, and a reader who does not handle calls asks the roster only for who is on duty', async () => {
  const calls = stubRoster({ can_handle: false, rows: [row({ sent: [{ officer_id: 'u1', full_name: 'Desk One', rank: 'HC', sent_at: '2026-11-25T09:06:00+05:30', to_you: true }] })] }, [])
  render(<Calls112 />)
  expect(await screen.findByText(/^Sent to you on /)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Send to this officer' })).toBeNull()
  expect(calls.filter((c) => c.url.startsWith('/api/duty-roster'))).toHaveLength(1)   // the beat list of the screen itself
})
