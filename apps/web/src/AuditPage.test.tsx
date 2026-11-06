// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import AuditPage from './AuditPage'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', permissions: ['audit.read_protected'] } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const stations = [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS' }, { id: 's2', state_code: 'IN', district: 'Other District', name: 'Demo Far PS' }]
const entry = (kind: string, what: string, extra = {}) => ({ kind, at: '2026-11-01T10:00:00Z', who_name: 'SI Fictional Asha', who_rank: 'SI', what, reason: null, fir_id: null, fir_ref: null, ...extra })

function stub(answer: (url: string) => { status: number; body: unknown }) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    if (url === '/api/stations') return { ok: true, status: 200, json: async () => stations }
    const a = answer(url)
    return { ok: a.status < 300, status: a.status, json: async () => a.body }
  }))
  return urls
}

test('one table shows reads, accepted gaps and admin changes with kind, reason and a link to the case', async () => {
  const urls = stub(() => ({ status: 200, body: [
    entry('protected_read', 'fir_text', { fir_id: 'f1', fir_ref: '2026/7' }),
    entry('override', 'ingredient:cheating/delivery', { reason: 'Fictional reason to accept', fir_id: 'f1', fir_ref: '2026/7' }),
    entry('override_withdrawn', 'ingredient:cheating/delivery', { reason: 'Fictional withdrawal' }),
    entry('admin_action', 'user_disabled', { reason: 'Fictional reason: left the force' }),
  ] }))
  render(<AuditPage />)
  const rows = within(await screen.findByRole('table', { name: 'Audit log of this police station, newest first' })).getAllByRole('row')
  expect(rows).toHaveLength(5)
  expect(rows[1].textContent).toContain('Protected details read')
  expect(rows[1].textContent).toContain('FIR text')
  expect(within(rows[1]).getByRole('link', { name: 'FIR 2026/7' }).getAttribute('href')).toBe('#/firs/f1')
  expect(rows[2].textContent).toContain('Gap accepted')
  expect(rows[2].textContent).toContain('Fictional reason to accept')
  expect(rows[3].textContent).toContain('Acceptance withdrawn')
  expect(rows[4].textContent).toContain('Admin change')
  expect(rows[4].textContent).toContain('user_disabled')
  expect(urls).toContain('/api/audit-log?stationId=s1&limit=100&offset=0')
  expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
})

test('an empty log says so; another station shows the server refusal, not the rows before; pages walk older and newer', async () => {
  const full = Array.from({ length: 100 }, (_, i) => entry('protected_read', 'people', { at: `2026-11-01T10:${String(i % 60).padStart(2, '0')}:00Z` }))
  const urls = stub((url) => url.includes('s2') ? { status: 403, body: {} } : url.includes('offset=100') ? { status: 200, body: [] } : { status: 200, body: full })
  render(<AuditPage />)
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: 'Older' }))
  expect(await screen.findByText('Nothing in the audit log of this police station.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Newer' }))
  await screen.findByRole('table')
  expect(urls.some((u) => u.endsWith('offset=0'))).toBe(true)
  fireEvent.change(screen.getByLabelText('Police station'), { target: { value: 's2' } })
  expect((await screen.findByRole('alert')).textContent).toContain('403')
  expect(screen.queryByRole('table')).toBeNull()
})
