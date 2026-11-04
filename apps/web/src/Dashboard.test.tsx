// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import Dashboard from './Dashboard'
import { setSession } from './api'

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
