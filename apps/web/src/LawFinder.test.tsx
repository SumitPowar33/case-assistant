// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LawFinder from './LawFinder'
import { setSession } from './api'

// Fictional data only (section numbers are the public numbers of the Acts).
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const table = {
  status: 'draft', note: 'Advisory only.',
  entries: [
    { law: 'IPC', newLaw: 'BNS', from: '302', to: '103', what: 'Murder: punishment', partial: false },
    { law: 'IPC', newLaw: 'BNS', from: '379', to: '303', what: 'Theft: punishment', partial: false },
    { law: 'IPC', newLaw: 'BNS', from: '377', to: null, what: 'Unnatural offences', partial: false },
    { law: 'CrPC', newLaw: 'BNSS', from: '154', to: '173', what: 'Information in a cognizable offence (FIR)', partial: false },
    { law: 'IEA', newLaw: 'BSA', from: '65B', to: '63', what: 'Electronic records', partial: true },
  ],
}
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body })
function page(answer: () => Promise<unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toBe('/api/law-finder')
    return answer()
  }))
  render(<LawFinder />)
}
const rows = () => screen.queryAllByRole('row').length - 1   // without the header row

test('the table shows the old section beside the new one, says it is a draft, and marks sections that only partly match', async () => {
  page(ok(table))
  expect(await screen.findByText('IPC 302')).toBeTruthy()
  expect(screen.getByText('BNS 103')).toBeTruthy()
  expect(screen.getByText(/a prosecutor has not checked this table/i)).toBeTruthy()
  expect(screen.getByText('5 sections shown')).toBeTruthy()
  expect(screen.getByText('No section takes its place')).toBeTruthy()
  expect(screen.getByText('partly matches')).toBeTruthy()
  expect(screen.getByText(/Marked|marked/)).toBeTruthy()
  expect(screen.getByText(/Which law applies\?/)).toBeTruthy()
  expect(rows()).toBe(5)
})

test('a reviewed table has no draft warning', async () => {
  page(ok({ ...table, status: 'reviewed' }))
  await screen.findByText('IPC 302')
  expect(screen.queryByText(/a prosecutor has not checked/i)).toBeNull()
})

test('the search finds a section number in the old or the new law, or a word of what it covers; no match says so', async () => {
  page(ok(table))
  await screen.findByText('IPC 302')
  const box = screen.getByLabelText('Section number or offence')
  fireEvent.change(box, { target: { value: '103' } })
  expect(rows()).toBe(1)
  expect(screen.getByText('IPC 302')).toBeTruthy()
  fireEvent.change(box, { target: { value: 'theft' } })
  expect(screen.getByText('IPC 379')).toBeTruthy()
  expect(rows()).toBe(1)
  fireEvent.change(box, { target: { value: 'bnss 173' } })
  expect(screen.getByText('CrPC 154')).toBeTruthy()
  fireEvent.change(box, { target: { value: 'xyz' } })
  expect(screen.getByText(/Nothing matches/)).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('the buttons keep one law of the table, and All brings the rest back', async () => {
  page(ok(table))
  await screen.findByText('IPC 302')
  fireEvent.click(screen.getByRole('button', { name: 'CrPC → BNSS' }))
  expect(rows()).toBe(1)
  expect(screen.getByRole('button', { name: 'CrPC → BNSS' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'IPC → BNS' }))
  expect(rows()).toBe(3)
  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  expect(rows()).toBe(5)
})

test('a table with no partial match has no note about them; a bad answer or a refusal is shown', async () => {
  page(ok({ ...table, entries: table.entries.slice(0, 2) }))
  await screen.findByText('IPC 302')
  expect(screen.queryByText('partly matches')).toBeNull()
  expect(screen.queryByText(/Marked/)).toBeNull()
  cleanup()
  page(ok({ status: 'draft', note: '', entries: 'broken' }))
  expect(await screen.findByText(/Nothing matches/)).toBeTruthy()
  cleanup()
  page(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Not allowed.' }) }))
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a row with a new section has a button that opens the AI explanation of that row only; a row without one has none', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/law-finder') return { ok: true, status: 200, json: async () => table }
    expect(JSON.parse(init!.body as string).prompt).toContain(url.endsWith('generate') ? 'IPC section 379' : '')
    return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft: 'BNS 303 took the place of IPC 379.', provider: 'fake', model: 'echo' }) }
  }))
  render(<LawFinder />)
  await screen.findByText('IPC 302')
  expect(screen.getAllByRole('button', { name: 'Explain in plain words' })).toHaveLength(4)   // not the row without a new section
  expect(screen.queryByLabelText('Language of the explanation')).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: 'Explain in plain words' })[1])
  expect(screen.getByRole('heading', { name: 'AI explanation of IPC 379 → BNS 303' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Explain with AI' }))
  expect(await screen.findByText('BNS 303 took the place of IPC 379.')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Explain in plain words' })[0])   // another row starts a fresh panel
  expect(screen.getByRole('heading', { name: 'AI explanation of IPC 302 → BNS 103' })).toBeTruthy()
  expect(screen.queryByText('BNS 303 took the place of IPC 379.')).toBeNull()
})
