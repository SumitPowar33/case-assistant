// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FirList from './FirList'
import { ScreenLangContext } from './i18n'
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

test('in Hindi the list, its columns and the page buttons are in Hindi', async () => {
  stub(60)
  render(<ScreenLangContext.Provider value="hi"><FirList /></ScreenLangContext.Provider>)
  expect(await screen.findByText('50/2026')).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'दर्ज' })).toBeTruthy()
  expect(screen.getByText('ज़ीरो एफआईआर')).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'पन्ने' })).toBeTruthy()
  expect(screen.getByText('पन्ना 1')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'पुराने' })).toBeTruthy()
  expect(screen.getAllByRole('cell', { name: 'जाँच शुरू की गई' }).length).toBeGreaterThan(0)   // the action taken, by its label
})

test('each row says zero FIR or FIR and marks a sexual offence; a refused list shows the reason', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.startsWith('/api/firs?') ? [{ ...fir(1), sexual_offence: true }, fir(2)] : [],
  })))
  render(<FirList />)
  const first = (await screen.findByRole('link', { name: '1/2026' })).closest('tr')!
  expect(first.textContent).toContain('Zero FIR · sexual offence')
  const second = screen.getByRole('link', { name: '2/2026' }).closest('tr')!
  expect(second.textContent).not.toContain('sexual offence')
  expect(second.textContent).not.toContain('Zero FIR')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<FirList />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})
