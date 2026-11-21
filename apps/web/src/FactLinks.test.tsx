// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FactLinks from './FactLinks'
import FactCheck from './FactCheck'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(links: unknown, facts: unknown = []) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const body = url.endsWith('/links') ? links : facts
    return { ok: true, status: 200, json: async () => body }
  }))
  return urls
}

const LINKS = [
  { fact_id: 'k1', kind: 'phone', value: '+91 98765 41207', firs: [], others: 1 },
  { fact_id: 'k2', kind: 'account', value: 'SBIN00123456789', firs: [{ id: 'f3', fir_no: 198, fir_year: 2026 }, { id: 'f4', fir_no: 7, fir_year: 2025 }], others: 2 },
]

test('a linked number names the FIRs the officer may open and only counts the others', async () => {
  const urls = stub(LINKS)
  render(<FactLinks firId="f1" version={0} />)
  expect(await screen.findByRole('heading', { name: 'Numbers also in other FIRs of this station' })).toBeTruthy()
  expect(urls).toEqual(['/api/firs/f1/facts/links'])
  const [phone, account] = screen.getAllByRole('listitem')
  expect(phone.textContent).toContain('+91 98765 41207')
  expect(phone.textContent).toContain('and in 1 FIR(s) of this station you are not on the case team of')
  expect(phone.querySelector('a')).toBeNull()
  expect(account.textContent).toContain('also in FIR 198/2026, FIR 7/2025')
  expect(screen.getByRole('link', { name: 'FIR 198/2026' }).getAttribute('href')).toBe('#/firs/f3')
  expect(account.textContent).toContain('and in 2 FIR(s)')
  expect(screen.getByText(/it does not say who did what/)).toBeTruthy()
})

test('no link, or an answer that is not a list, shows nothing', async () => {
  stub([])
  const { container } = render(<FactLinks firId="f1" version={0} />)
  await new Promise((r) => setTimeout(r, 0))
  expect(container.innerHTML).toBe('')
  cleanup()
  stub({ error: 'x' })
  const second = render(<FactLinks firId="f1" version={0} />)
  await new Promise((r) => setTimeout(r, 0))
  expect(second.container.innerHTML).toBe('')
})

const kept = { id: 'k1', kind: 'phone', value: '+91 98765 41207', ai_value: '+91 98765 41207', corrected: false, quote: '+91 98765 41207', confirmed_at: '2026-11-08T10:00:00Z', confirmed_by_name: 'SI Fictional' }

test('the fact check asks for links of an FIR with confirmed facts, never of a complaint, a protected case or an FIR without facts', async () => {
  let urls = stub(LINKS, [kept])
  render(<FactCheck firId="f1" text="Call from +91 98765 41207." victimProtected={false} />)
  expect(await screen.findByRole('heading', { name: 'Numbers also in other FIRs of this station' })).toBeTruthy()
  expect(urls).toContain('/api/firs/f1/facts/links')
  for (const props of [{ complaint: true, victimProtected: false }, { victimProtected: true }]) {
    cleanup()
    urls = stub(LINKS, [kept])
    render(<FactCheck firId="f1" text="Call from +91 98765 41207." {...props} />)
    expect(await screen.findByText(/confirmed by SI Fictional/)).toBeTruthy()
    expect(urls.some((u) => u.endsWith('/links'))).toBe(false)
  }
  cleanup()
  urls = stub(LINKS, [])
  render(<FactCheck firId="f1" text="Call." victimProtected={false} />)
  expect(await screen.findByText('No fact of this FIR is confirmed yet.')).toBeTruthy()
  expect(urls.some((u) => u.endsWith('/links'))).toBe(false)
})
