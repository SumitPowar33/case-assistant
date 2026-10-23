// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App'

const fir = { id: 'f1', fir_year: 2026, fir_no: 7, registered_at: '2026-09-10T10:00:00Z', is_zero_fir: false, action_taken: 'registered', sexual_offence: false, contents_original: 'Fictional complaint text', sections: [{ act: 'BNS', section: '318' }] }
const routes: Record<string, unknown> = {
  '/api/firs': [fir],
  '/api/firs/f1': fir,
  '/api/firs/f1/people': [{ id: 'p1', role: 'victim', label: 'V1', display_name: 'Victim 1', age_years: 30, identity_masked: true }],
  '/api/firs/f1/deadlines': [{ kind: 'chargesheet_60', due_on: '2026-11-10', basis: 'BNSS 187(3)' }],
  '/api/firs/f1/evidence': [{ id: 'e1', label: 'Bank statement', kind: 'electronic', sha256: null, court_ready: false }],
}
function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = routes[url]
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body }
  }))
}
afterEach(() => { cleanup(); window.location.hash = ''; vi.unstubAllGlobals() })

test('lists FIRs with a link to the detail page', async () => {
  mockApi()
  render(<App />)
  expect((await screen.findByRole('link', { name: '7/2026' })).getAttribute('href')).toBe('#/firs/f1')
})

test('detail shows people with protected identity, deadlines and evidence', async () => {
  mockApi()
  window.location.hash = '#/firs/f1'
  render(<App />)
  expect(await screen.findByText(/identity protected/)).toBeTruthy()
  expect(await screen.findByText(/BNSS 187\(3\)/)).toBeTruthy()
  expect(await screen.findByText(/not court-ready yet/)).toBeTruthy()
})

test('shows an error when the server fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<App />)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('500'))
})
