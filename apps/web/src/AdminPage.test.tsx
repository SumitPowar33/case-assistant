// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import AdminPage from './AdminPage'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'a1', username: 'admin.one', full_name: 'State Admin', rank: 'Admin', role: 'state_admin', station_id: null } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const accounts = [
  { id: 'a1', username: 'admin.one', full_name: 'State Admin', rank: 'Admin', role: 'state_admin', station_id: null, station_name: null, district: null, active: true, locked_until: null },
  { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1', station_name: 'Demo Cyber PS', district: 'Demo District', active: true, locked_until: '2026-10-25T16:00:00Z' },
  { id: 'u2', username: 'hc.away', full_name: 'HC Away', rank: 'HC', role: 'front_desk', station_id: 's1', station_name: 'Demo Cyber PS', district: 'Demo District', active: false, locked_until: null },
]
const lists: Record<string, unknown> = {
  '/users': accounts,
  '/stations': [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS', cctns_code: null }],
  '/state-packs': [{ code: 'IN', name: 'National', status: 'draft' }],
  '/admin-actions': [{ action: 'user_disabled', reason: 'Fictional transfer out', at: '2026-10-25T10:00:00Z', actor_name: 'State Admin', username: 'hc.away', user_name: 'HC Away', station_name: null }],
  '/roles': [{ code: 'io', label: 'Investigating officer', station_required: true, permissions: ['case.write'] }, { code: 'state_admin', label: 'State admin', station_required: false, permissions: [] }],
  '/sign-ins': [{ username_tried: 'si.fictional', outcome: 'wrong_password', client_ip: '127.0.0.1', at: '2026-10-25T15:45:00Z' }],
}

function stub(write: { status: number; body: unknown } = { status: 204, body: null }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '').replace(/\?.*/, '')] ?? [] }
  }))
  return writes
}
const type = (label: string | RegExp, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } })

test('accounts show their state; locked ones can be unlocked and disabled ones enabled, each with a reason', async () => {
  const writes = stub()
  render(<AdminPage />)
  const row = (await screen.findByText('SI Fictional (SI)')).closest('tr')!
  expect(within(row).getByText('Locked until 25 Oct 2026, 9:30 pm IST')).toBeTruthy()
  expect(within(screen.getByText('HC Away (HC)').closest('tr')!).getByText('Disabled')).toBeTruthy()
  expect(screen.queryByText('Enable', { selector: 'summary' })).toBeTruthy()
  type('Reason to unlock SI Fictional', 'Officer called from the station')
  fireEvent.click(screen.getByRole('button', { name: 'Unlock SI Fictional' }))
  expect((await screen.findByRole('status')).textContent).toBe('SI Fictional is unlocked.')
  expect(writes).toEqual([{ url: '/api/users/u1/unlock', body: { reason: 'Officer called from the station' } }])
  expect(screen.getByText(/Account disabled: HC Away \(hc.away\) by State Admin. Reason: “Fictional transfer out”/)).toBeTruthy()
  expect(screen.getByText('wrong password')).toBeTruthy()
})

test('a station role needs a station and both passwords must match before anything is sent', async () => {
  const writes = stub({ status: 201, body: { id: 'u9' } })
  render(<AdminPage />)
  const form = (await screen.findByText('Add an account')).closest('details')!
  type('Full name', 'PSI Demo', within(form))
  type('Rank', 'PSI', within(form))
  type(/^Username/, 'psi.demo', within(form))
  type(/^First password \(/, 'fictional-pass-123', within(form))
  type('First password again', 'fictional-pass-124', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The two passwords are not the same.')
  type('First password again', 'fictional-pass-123', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Choose the police station for this role.')
  expect(writes).toHaveLength(0)
  type(/^Police station/, 's1', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/users', body: { username: 'psi.demo', password: 'fictional-pass-123', fullName: 'PSI Demo', rank: 'PSI', role: 'io', stationId: 's1' } })
})

test('your own account cannot be disabled from here; a server refusal is shown', async () => {
  stub({ status: 409, body: { message: 'This account is already disabled.' } })
  render(<AdminPage />)
  const own = (await screen.findByText('State Admin (Admin)')).closest('tr')!
  expect(within(own).queryByText('Disable', { selector: 'summary' })).toBeNull()
  expect(within(own).getByText('you')).toBeTruthy()
  type('Reason to disable SI Fictional', 'Testing a refusal here')
  fireEvent.click(screen.getByRole('button', { name: 'Disable SI Fictional' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This account is already disabled.')
})

test('a transfer changes role, rank or station with a reason and warns about FIRs the officer is still IO of', async () => {
  const writes = stub({ status: 200, body: { changed: 'role io to sho; rank SI to PI', firsAsIo: 2 } })
  render(<AdminPage />)
  const row = (await screen.findByText('SI Fictional (SI)')).closest('tr')!
  expect(within(screen.getByText('State Admin (Admin)').closest('tr')!).queryByText('Change', { selector: 'summary' })).toBeNull()
  fireEvent.change(within(row).getByLabelText('New role for SI Fictional'), { target: { value: 'sho' } })
  type('Rank', 'PI', within(row))
  type(/^Reason \(for example/, 'Fictional transfer order 12', within(row))
  fireEvent.click(within(row).getByRole('button', { name: 'Change SI Fictional' }))
  expect((await screen.findByRole('status')).textContent).toBe(
    'SI Fictional: role io to sho; rank SI to PI. They must sign in again. They are still the IO of 2 FIRs; give those cases to another officer.')
  expect(writes).toEqual([{ url: '/api/users/u1', body: { role: 'sho', rank: 'PI', stationId: 's1', reason: 'Fictional transfer order 12' } }])
})

test('the role list from the packs is shown read-only', async () => {
  stub()
  render(<AdminPage />)
  const row = (await screen.findByText('Investigating officer', { selector: 'th' })).closest('tr')!
  expect(within(row).getByText('case.write')).toBeTruthy()
  expect(within(screen.getByText('State admin', { selector: 'th' }).closest('tr')!).getByText('—')).toBeTruthy()
})
