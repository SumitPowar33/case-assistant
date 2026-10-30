// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FirDetail from './FirDetail'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const fir = { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T05:00:00Z', is_zero_fir: false, contents_original: 'Fictional complaint words',
  contents_withheld: false, action_taken: 'investigate', io_name: 'SI Fictional One', sections: [{ act: 'BNS', section: '318(4)' }] }

function stub(over: Record<string, unknown>, failing: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace('/api', '')
    if (failing.includes(path)) return { ok: false, status: 500, json: async () => null }
    return { ok: true, status: 200, json: async () => (path in over ? over[path] : path === '/firs/f1' ? fir : path === '/firs/f1/readiness' ? { gaps: [], issues: [] } : path === '/firs/f1/punishment-hint' ? { suggested: null, unknown: [], sections: [] } : []) }
  }))
}

test('a full case page: sections, people, deadlines and electronic evidence with its court-ready state', async () => {
  stub({
    '/firs/f1/people': [{ id: 'p1', role: 'victim', label: 'V1', display_name: 'Victim V1', age_years: 17, identity_masked: true },
      { id: 'p2', role: 'accused', label: 'A1', display_name: 'Fictional Accused', age_years: null, identity_masked: false }],
    '/firs/f1/deadlines': [{ kind: 'chargesheet_custody', due_on: '2026-11-30', basis: 'BNSS 187(3)' }],
    '/firs/f1/evidence': [{ id: 'e1', label: 'Phone', kind: 'electronic', sha256: null, court_ready: false },
      { id: 'e2', label: 'Laptop', kind: 'electronic', sha256: 'a'.repeat(64), court_ready: true },
      { id: 'e3', label: 'Knife', kind: 'physical', sha256: null, court_ready: false }],
  })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText('FIR 9/2026')).toBeTruthy()
  expect(screen.getByText('Sections: BNS 318(4)')).toBeTruthy()
  expect(screen.getByText('Fictional complaint words')).toBeTruthy()
  expect(await screen.findByText(/V1 \(victim\), 17: Victim V1 \(identity protected\)/)).toBeTruthy()
  expect(screen.getByText(/A1 \(accused\): Fictional Accused$/)).toBeTruthy()
  expect(await screen.findByText(/chargesheet_custody: by 2026-11-30/)).toBeTruthy()
  expect(await screen.findByText(/Phone \(electronic\) · not court-ready yet \(BSA 63\(4\)\)/)).toBeTruthy()
  expect(screen.getByText(/Laptop \(electronic\) · court-ready/)).toBeTruthy()
  expect(screen.getByText('Knife (physical)')).toBeTruthy()
})

test('a zero FIR with no sections, and a protected case that withholds the complaint text', async () => {
  stub({ '/firs/f1': { ...fir, is_zero_fir: true, sections: [], contents_original: null, contents_withheld: true } })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText('FIR 9/2026 (Zero FIR)')).toBeTruthy()
  expect(screen.getByText('Sections: none')).toBeTruthy()
  expect(screen.getByText(/Complaint text withheld/)).toBeTruthy()
  expect(screen.queryByText('Fictional complaint words')).toBeNull()
})

test('an FIR that cannot be loaded shows the error, and a section that cannot be loaded shows its own', async () => {
  stub({}, ['/firs/f1'])
  const { unmount } = render(<FirDetail id="f1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
  unmount()
  stub({}, ['/firs/f1/deadlines'])
  render(<FirDetail id="f1" />)
  expect((await screen.findAllByRole('alert')).some((a) => a.textContent?.includes('/firs/f1/deadlines'))).toBe(true)
})
