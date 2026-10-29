// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FirList from './FirList'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })
const fir = (n: number) => ({ id: `f${n}`, fir_year: 2026, fir_no: n, registered_at: '2026-10-01T05:00:00Z', is_zero_fir: n === 1, action_taken: 'investigate', sexual_offence: false })

function stub(total: number) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const m = /\/firs\?limit=(\d+)&offset=(\d+)/.exec(url)
    if (!m) return { ok: true, status: 200, json: async () => [] }
    const rows = Array.from({ length: total }, (_, i) => fir(i + 1)).slice(+m[2], +m[2] + +m[1])
    return { ok: true, status: 200, json: async () => rows }
  }))
  return urls
}

test('a short list has no page buttons', async () => {
  stub(2)
  render(<FirList />)
  expect(await screen.findByText('1/2026')).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull()
})

test('an empty list says so', async () => {
  stub(0)
  render(<FirList />)
  expect(await screen.findByText('No FIRs yet.')).toBeTruthy()
})

test('a long list is shown 50 at a time with Older and Newer', async () => {
  const urls = stub(60)
  render(<FirList />)
  expect(await screen.findByText('50/2026')).toBeTruthy()
  expect(screen.queryByText('51/2026')).toBeNull()
  expect((screen.getByRole('button', { name: 'Newer' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Older' }))
  expect(await screen.findByText('51/2026')).toBeTruthy()
  expect(urls).toContain('/api/firs?limit=51&offset=50')
  expect((screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Newer' }))
  expect(await screen.findByText('1/2026')).toBeTruthy()
})
