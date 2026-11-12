// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EarlierRecords from './EarlierRecords'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(status: number, body: unknown) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return { ok: status < 300, status, json: async () => body } }))
  return urls
}

test('nothing is asked until the officer checks; each record says what matched and links only a case the officer may open', async () => {
  const urls = stub(200, { truncated: true, records: [
    { fir_id: 'f2', fir_no: 4, fir_year: 2025, registered_at: '2025-03-01T10:00:00Z', station: 'Fictional South PS', role: 'accused', label: 'A2', name: 'Ravi Fictional', matched_on: ['phone', 'name_parentage'], can_open: true },
    { fir_id: 'f3', fir_no: 9, fir_year: 2024, registered_at: '2024-05-01T10:00:00Z', station: 'Fictional East PS', role: 'suspect', label: 'S1', name: null, matched_on: ['account'], can_open: false },
  ] })
  render(<EarlierRecords firId="f1" personId="p1" label="A1" />)
  expect(urls).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Check earlier records of A1' }))
  expect(await screen.findByRole('heading', { name: 'Earlier records of A1' })).toBeTruthy()
  expect(urls[0]).toBe('/api/firs/f1/people/p1/involvement')
  expect(screen.getByRole('link', { name: 'FIR 4/2025' }).getAttribute('href')).toBe('#/firs/f2')
  expect(screen.queryByRole('link', { name: 'FIR 9/2024' })).toBeNull()
  expect(screen.getByText('FIR 9/2024')).toBeTruthy()
  expect(screen.getByText('same phone')).toBeTruthy()
  expect(screen.getByText('same name and parentage')).toBeTruthy()
  expect(screen.getByText('linked account')).toBeTruthy()
  expect(screen.getByText(/A match is not proof/)).toBeTruthy()
  expect(screen.getByText('Only the newest 100 are shown.')).toBeTruthy()
})

test('no match says so, and a refusal is shown', async () => {
  stub(200, { records: [], truncated: false })
  render(<EarlierRecords firId="f1" personId="p1" label="A1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Check earlier records of A1' }))
  expect(await screen.findByText('No accused or suspect in another FIR matches.')).toBeTruthy()
  cleanup()
  stub(400, { error: 'Earlier records are checked only for an accused or a suspect.' })
  render(<EarlierRecords firId="f1" personId="p1" label="V1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Check earlier records of V1' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
})
