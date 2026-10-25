// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Chargesheets from './Chargesheets'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

test('a chargesheet names the ticked accused; none ticked is refused before sending', async () => {
  const writes: { url: string; body: unknown }[] = []
  const lists: Record<string, unknown> = {
    '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional One' }, { id: 'p2', role: 'accused', label: 'A2', display_name: 'Fictional Two' },
      { id: 'p3', role: 'witness', label: 'W1', display_name: 'Fictional Witness' }],
    '/firs/f1/chargesheets': [{ id: 'c1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1' }],
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 201, json: async () => ({ id: 'c2' }) }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  const saved = vi.fn()
  render(<Chargesheets firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/CS-1: filed on 2026-10-20 in Fictional JMFC Court, naming A1/)).toBeTruthy()
  expect(screen.queryByLabelText(/W1/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Filed on'), { target: { value: '2026-10-25' } })
  fireEvent.change(screen.getByLabelText('Court'), { target: { value: 'Fictional JMFC Court' } })
  fireEvent.change(screen.getByLabelText('Chargesheet number'), { target: { value: 'CS-2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Tick the accused this chargesheet names.')
  fireEvent.click(screen.getByLabelText(/A2: Fictional Two/))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/chargesheets', body: { filedOn: '2026-10-25', court: 'Fictional JMFC Court', reportNo: 'CS-2', accusedIds: ['p2'] } }])
})
