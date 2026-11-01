// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ReadsPage from './ReadsPage'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', permissions: ['audit.read_protected'] } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const stations = [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS' }, { id: 's2', state_code: 'IN', district: 'Other District', name: 'Demo Far PS' }]
const read = (i: number, what = 'people') => ({ id: `r${i}`, at: '2026-11-01T10:00:00Z', what, fir_id: 'f1', fir_ref: '2026/7', complaint_id: null, reader_name: 'SI Fictional Asha', reader_rank: 'SI', reader_username: 'si.asha' })

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

test('the log of the own station shows when, who, what was shown and the case, with links to it', async () => {
  const urls = stub(() => ({ status: 200, body: [read(1, 'fir_text'), { ...read(2, 'complaint_list'), fir_id: null, fir_ref: null, complaint_id: 'c9', reader_username: null }] }))
  render(<ReadsPage />)
  const table = await screen.findByRole('table', { name: 'Reads at this police station, newest first' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1].textContent).toContain('SI Fictional Asha (SI)')
  expect(rows[1].textContent).toContain('si.asha')
  expect(rows[1].textContent).toContain('FIR text')
  expect(rows[1].textContent).toContain('IST')
  expect(within(rows[1]).getByRole('link', { name: 'FIR 2026/7' }).getAttribute('href')).toBe('#/firs/f1')
  expect(rows[2].textContent).toContain("Informant's name in the complaint list")
  expect(within(rows[2]).getByRole('link', { name: 'Complaint' }).getAttribute('href')).toBe('#/complaints/c9')
  expect(urls).toContain('/api/protected-reads?stationId=s1&limit=100&offset=0')
  expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
  expect((screen.getByLabelText('Police station') as HTMLSelectElement).value).toBe('s1')
})

test('another station is chosen from the list; the server refusal is shown, not the rows of the station before', async () => {
  stub((url) => url.includes('s2') ? { status: 403, body: {} } : { status: 200, body: [read(1)] })
  render(<ReadsPage />)
  expect(await screen.findByText('People of the case')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Police station'), { target: { value: 's2' } })
  expect((await screen.findByRole('alert')).textContent).toContain('403')
  expect(screen.queryByText('People of the case')).toBeNull()
})

test('a full page offers older reads, and from there newer ones', async () => {
  const urls = stub((url) => ({ status: 200, body: url.endsWith('offset=0') ? Array.from({ length: 100 }, (_, i) => read(i)) : [read(200, 'complaint')] }))
  render(<ReadsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Older' }))
  expect(await screen.findByText('Complaint opened')).toBeTruthy()
  expect(urls).toContain('/api/protected-reads?stationId=s1&limit=100&offset=100')
  expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Newer' }))
  expect(await screen.findByRole('button', { name: 'Older' })).toBeTruthy()
})

test('no reads yet, an account without a station starts on the first station, and in Marathi', async () => {
  setSession({ token: 't', user: { id: 'u2', username: 'admin', full_name: 'Fictional Admin', rank: 'IG', role: 'state_admin', station_id: null, permissions: ['audit.read_protected'] } })
  const urls = stub(() => ({ status: 200, body: [] }))
  render(<ScreenLangContext.Provider value="mr"><ReadsPage /></ScreenLangContext.Provider>)
  expect(await screen.findByText('या पोलीस ठाण्यात संरक्षित तपशील वाचल्याची नोंद नाही.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'संरक्षित पीडितेचा तपशील कोणी वाचला' })).toBeTruthy()
  expect(urls).toContain('/api/protected-reads?stationId=s1&limit=100&offset=0')
})

test('no stations at all, and a station list that fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
  render(<ReadsPage />)
  expect(await screen.findByText('No reads of protected details at this police station.')).toBeTruthy()
  cleanup()
  setSession({ token: 't', user: { id: 'u2', username: 'admin', full_name: 'Fictional Admin', rank: 'IG', role: 'state_admin', station_id: null } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<ReadsPage />)
  expect((await screen.findByRole('alert')).textContent).not.toBe('')
})
