// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import IoAssignment from './IoAssignment'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })
const as = (role: string) => setSession({ token: 't', user: { id: 'u1', username: 'x.fictional', full_name: 'Fictional', rank: 'PI', role, station_id: 's1' } })

function stub(lists: Record<string, unknown>) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 204, json: async () => null }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  return writes
}
const lists = {
  '/firs/f1/io-candidates': [{ id: 'i1', full_name: 'SI Fictional One', rank: 'SI', role: 'io' }, { id: 'i2', full_name: 'SI Fictional Two', rank: 'SI', role: 'io' }],
  '/firs/f1/io-history': [{ at: '2026-10-01T05:00:00Z', from_name: null, to_name: 'SI Fictional One', assigned_by_name: 'PI Fictional SHO', reason: null }],
}

test('the SHO changes the IO only with a reason; the history is shown', async () => {
  as('sho')
  const writes = stub(lists)
  const saved = vi.fn()
  render(<IoAssignment firId="f1" ioName="SI Fictional One" version={0} onSaved={saved} />)
  expect(screen.getByText('Investigating officer: SI Fictional One')).toBeTruthy()
  expect(await screen.findByText(/SI Fictional One assigned by PI Fictional SHO/)).toBeTruthy()
  fireEvent.change(await screen.findByLabelText('Officer'), { target: { value: 'i2' } })
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Fictional leave of IO' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/io', body: { ioId: 'i2', reason: 'Fictional leave of IO' } }])
})

test('an FIR without an IO says so; an IO does not get the assign form', async () => {
  as('io')
  stub(lists)
  render(<IoAssignment firId="f1" ioName={null} version={0} onSaved={() => {}} />)
  expect(screen.getByText('not assigned yet')).toBeTruthy()
  await screen.findByText('IO history')
  expect(screen.queryByText('Assign the IO')).toBeNull()
})
