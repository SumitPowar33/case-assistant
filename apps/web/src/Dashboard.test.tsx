// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import Dashboard from './Dashboard'
import { setSession } from './api'
import { istToday } from './formats'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional Rao', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const d = (over: object) => ({ fir_id: 'f1', fir_no: 7, fir_year: 2026, kind: 'chargesheet_custody', due_on: '2026-11-11', basis: 'BNSS 187(3)', days_left: 5, ...over })

function stub(board: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/dashboard')
    ? { ok, status: ok ? 200 : 500, json: async () => board }
    : { ok: true, status: 200, json: async () => [] }))
}

test('deadlines within 14 days are listed by urgency with a word as well as a colour, each linked to its case', async () => {
  stub({
    cases: 4, due_in_7_days: 3, notices_waiting: 1,
    deadlines: [d({ days_left: -2 }), d({ fir_id: 'f2', fir_no: 8, days_left: 0 }), d({ fir_id: 'f3', fir_no: 9, days_left: 3 }),
      d({ fir_id: 'f4', fir_no: 10, days_left: 7, kind: 'notice_reply:Fictional Bank' }), d({ fir_id: 'f5', fir_no: 11, days_left: 14 }), d({ fir_id: 'f6', fir_no: 12, days_left: 30 })],
  })
  render(<Dashboard />)
  expect(await screen.findByRole('heading', { name: 'Welcome, SI Fictional Rao' })).toBeTruthy()
  const attention = within(screen.getByRole('region', { name: 'Needs your attention' }))
  expect(attention.getAllByText('Critical')).toHaveLength(3)   // overdue, today and 3 days
  expect(attention.getAllByText('Action')).toHaveLength(1)   // 7 days
  expect(attention.getAllByText('Upcoming')).toHaveLength(1)   // 14 days
  expect(attention.queryByText(/FIR 12\/2026/)).toBeNull()   // 30 days is not for this list
  expect(attention.getByText(/2 days overdue/)).toBeTruthy()
  expect(attention.getByText(/Due today/)).toBeTruthy()
  expect(attention.getByText(/Reply to the notice from Fictional Bank/)).toBeTruthy()
  expect(attention.getAllByRole('link', { name: 'Open' })[0].getAttribute('href')).toBe('#/firs/f1/deadlines')
  const upcoming = within(screen.getByRole('region', { name: 'Coming deadlines' }))
  expect(upcoming.getAllByRole('listitem')).toHaveLength(6)
})

test('with no deadlines both lists say nothing falls due, and the tiles show the counts', async () => {
  stub({ cases: 0, due_in_7_days: 0, notices_waiting: 0, deadlines: [] })
  render(<Dashboard />)
  expect(await screen.findAllByText('Nothing falls due in your cases.')).toHaveLength(2)
  expect(within(screen.getByRole('group', { name: 'Dashboard' })).getAllByText('0')).toHaveLength(3)
})

test('a deadline far off is only in the coming list, and a failed read shows its error without tiles', async () => {
  stub({ cases: 1, due_in_7_days: 0, notices_waiting: 0, deadlines: [d({ days_left: 40 })] })
  render(<Dashboard />)
  expect(await screen.findByRole('region', { name: 'Coming deadlines' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Needs your attention' })).getByText('Nothing falls due in your cases.')).toBeTruthy()
  cleanup()
  stub({}, false)
  render(<Dashboard />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
  expect(screen.queryByRole('group', { name: 'Dashboard' })).toBeNull()
})

test('without a signed-in user the welcome has no name (the screen is only reached signed in)', async () => {
  setSession(null)
  stub({ cases: 0, due_in_7_days: 0, notices_waiting: 0, deadlines: [] })
  render(<Dashboard />)
  expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeTruthy()
})

test('a POCSO case with steps still open is listed in red with its count, linked to its deadlines, even when no deadline is near', async () => {
  stub({ cases: 1, due_in_7_days: 0, notices_waiting: 0, deadlines: [], pocso_open: [{ fir_id: 'f9', fir_no: 31, fir_year: 2026, open_steps: 5 }] })
  render(<Dashboard />)
  const attention = within(await screen.findByRole('region', { name: 'Needs your attention' }))
  expect(attention.getByText(/FIR 31\/2026 · POCSO steps still open: 5/)).toBeTruthy()
  expect(attention.getByText('Critical')).toBeTruthy()
  expect(attention.queryByText('Nothing falls due in your cases.')).toBeNull()
  expect(attention.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#/firs/f9/deadlines')
})

const clash = (over: object) => ({ officer_id: 'u1', full_name: 'SI Fictional Rao', rank: 'SI', on_date: istToday(Date.now() + 2 * 86_400_000),
  kind: 'leave', shift: null, post: null, fir_id: 'f9', fir_no: 19, fir_year: 2026, ...over })

test('a court date of the next 14 days with the investigating officer not on court duty is an attention line that opens the roster', async () => {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    const body = url.startsWith('/api/dashboard') ? { cases: 1, due_in_7_days: 0, notices_waiting: 0, deadlines: [] }
      : url.startsWith('/api/duty-roster') ? { court_clashes: [clash({}), clash({ on_date: istToday(Date.now() + 14 * 86_400_000), fir_id: 'f10', fir_no: 20, kind: 'duty', shift: 'night', post: 'beat' }),
        clash({ on_date: istToday(Date.now() + 15 * 86_400_000), fir_id: 'f11', fir_no: 21 })] } : []
    return { ok: true, status: 200, json: async () => body }
  }))
  render(<Dashboard />)
  const attention = await screen.findByRole('region', { name: 'Needs your attention' })
  expect(await within(attention).findByText(`FIR 19/2026: court date ${istToday(Date.now() + 2 * 86_400_000)}, investigating officer not on court duty`)).toBeTruthy()
  expect(within(attention).getByText('Investigating officer SI Fictional Rao (SI) is rostered: Leave')).toBeTruthy()
  expect(within(attention).getByText('Investigating officer SI Fictional Rao (SI) is rostered: Night (10 pm to 6 am), Beat')).toBeTruthy()
  expect(within(attention).queryByText(/FIR 21\/2026/)).toBeNull()   // beyond the 14 days of this list
  expect(within(attention).getAllByRole('link', { name: 'Open' }).map((a) => a.getAttribute('href'))).toEqual(['#/roster', '#/roster'])
  expect(within(attention).queryByText('Nothing falls due in your cases.')).toBeNull()
  expect(calls).toContain('/api/duty-roster?stationId=s1')
})

test('a roster that cannot be read says so, and an officer without a station asks for none', async () => {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url)
    return url.startsWith('/api/duty-roster') ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => url.startsWith('/api/dashboard') ? { cases: 0, due_in_7_days: 0, notices_waiting: 0, deadlines: [] } : [] }
  }))
  render(<Dashboard />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
  expect(screen.getByRole('group', { name: 'Dashboard' })).toBeTruthy()   // the rest of the dashboard shows
  cleanup()
  calls.length = 0
  setSession({ token: 't', user: { id: 'u2', username: 'admin.fictional', full_name: 'Fictional Admin', rank: 'Admin', role: 'state_admin', station_id: null } })
  render(<Dashboard />)
  expect(await screen.findByRole('group', { name: 'Dashboard' })).toBeTruthy()
  expect(calls.some((u) => u.startsWith('/api/duty-roster'))).toBe(false)
})

test('112 events sent to this officer in the last 24 hours are attention lines; older ones and those sent to others are not', async () => {
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
  const call = (id: string, place: string, sent: object[]) => ({ id, place, kind: 'accident', sent })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.startsWith('/api/dashboard') ? { cases: 0, due_in_7_days: 0, notices_waiting: 0, deadlines: [] }
      : url.startsWith('/api/calls-112') ? { rows: [call('e1', 'Fictional Chowk', [{ sent_at: ago(1), to_you: true }]), call('e2', 'Fictional Old Road', [{ sent_at: ago(25), to_you: true }]),
        call('e3', 'Fictional Far Road', [{ sent_at: ago(1), to_you: false }])] } : []
    return { ok: true, status: 200, json: async () => body }
  }))
  render(<Dashboard />)
  const attention = await screen.findByRole('region', { name: 'Needs your attention' })
  expect(await within(attention).findByText('112 call sent to you: Accident, Fictional Chowk')).toBeTruthy()
  expect(within(attention).getByText(/^Sent to you on /)).toBeTruthy()
  expect(within(attention).queryByText(/Old Road|Far Road/)).toBeNull()
  expect(within(attention).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#/calls-112')
  expect(within(attention).queryByText('Nothing falls due in your cases.')).toBeNull()
})

test('a court date on a day with nothing rostered for the investigating officer says so', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => url.startsWith('/api/dashboard') ? { cases: 1, due_in_7_days: 0, notices_waiting: 0, deadlines: [] }
    : url.startsWith('/api/duty-roster') ? { court_clashes: [clash({ kind: null })] } : [] })))
  render(<Dashboard />)
  expect(await screen.findByText('Investigating officer SI Fictional Rao (SI) has nothing on the roster that day')).toBeTruthy()
})
