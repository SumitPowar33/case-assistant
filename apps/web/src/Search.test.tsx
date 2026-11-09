// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Search from './Search'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const SHA = 'ab'.repeat(32)
const memo = (over: object) => ({
  id: 'm1', place: 'Fictional house, A2 residence', grounds: 'Information that fictional phones are kept here',
  started_at: '2026-10-21T01:30:00Z', ended_at: '2026-10-21T02:10:00Z', no_witness_reason: null, recorded_by_name: 'SI Fictional',
  forwarded_on: null, forwarded_to: null, days_since: 3,
  witnesses: [{ name: 'Fictional Neighbour', address: 'Fictional lane 1' }, { name: 'Fictional Shopkeeper', address: 'Fictional lane 2' }],
  recordings: [{ sha256: SHA, seconds: 221, esakshya_id: 'ES-7731' }],
  items: [{ id: 'e1', label: 'E-03', description: 'Fictional phone, black', kind: 'physical', seal_no: '214/E-03' }], ...over,
})

function stub(list: unknown = [memo({})], write = { status: 201, message: 'Refused by the server.' }) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => ({ message: write.message, id: 'm2' }) }
    return { ok: true, status: 200, json: async () => list }
  }))
  return calls
}

const fill = (scope: HTMLElement, label: string, value: string) => fireEvent.change(within(scope).getByLabelText(label), { target: { value } })

function fillMemo() {
  const form = screen.getByRole('heading', { name: 'New search memo' }).closest('form') as HTMLElement
  fill(form, 'Place searched', 'Fictional house')
  fill(form, 'Grounds for the search (BNSS 185(1))', 'Fictional grounds of the search')
  fill(form, 'Search started (IST)', '2026-10-21T07:00')
  fill(form, 'Search ended (IST)', '2026-10-21T07:40')
  const w1 = screen.getByRole('group', { name: 'Witness 1' }), w2 = screen.getByRole('group', { name: 'Witness 2' })
  fill(w1, 'Name', 'Fictional Neighbour'); fill(w1, 'Present address', 'Fictional lane 1')
  fill(w2, 'Name', 'Fictional Shopkeeper'); fill(w2, 'Present address', 'Fictional lane 2')
  const r1 = screen.getByRole('group', { name: 'Recording 1' })
  fill(r1, 'Length (minutes:seconds)', '3:41'); fill(r1, 'SHA-256 of the file', SHA)
  return form
}

test('the memos show their witnesses, recording, items and whether the recording went to the Magistrate', async () => {
  stub([memo({}), memo({ id: 'm0', place: 'Fictional shop', witnesses: [], no_witness_reason: 'Nobody of the locality agreed', items: [], forwarded_on: '2026-10-21', forwarded_to: 'Fictional JMFC' })])
  render(<Search firId="f1" onSaved={() => {}} />)
  expect(await screen.findByText('Witnesses: Fictional Neighbour, Fictional Shopkeeper')).toBeTruthy()
  expect(screen.getAllByText(/Video, 3:41/)[0].textContent).toContain('ES-7731')
  expect(screen.getAllByText('abab…abab')).toHaveLength(2)
  expect(screen.getByText('E-03').parentElement?.textContent).toContain('214/E-03')
  expect(screen.getByText('Recording not yet sent to the Magistrate: 3 days since the search (BNSS 105: without delay)')).toBeTruthy()
  expect(screen.getByText('Fewer than two witnesses: Nobody of the locality agreed')).toBeTruthy()
  expect(screen.getByText('Recording sent to Fictional JMFC on 2026-10-21')).toBeTruthy()
})

test('a recording sent without a named court is shown by its date alone', async () => {
  stub([memo({ forwarded_on: '2026-10-22', forwarded_to: null })])
  render(<Search firId="f1" onSaved={() => {}} />)
  expect((await screen.findByText(/Recording sent to\s+on 2026-10-22/)).textContent).toBe('Recording sent to  on 2026-10-22')
})

test('an empty list says so, a failed read shows its error, and an answer of another shape does not crash', async () => {
  stub([])
  render(<Search firId="f1" onSaved={() => {}} />)
  expect(await screen.findByText('No search memo yet.')).toBeTruthy()
  cleanup()
  stub({})
  render(<Search firId="f1" onSaved={() => {}} />)
  expect(await screen.findByText('No search memo yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<Search firId="f1" onSaved={() => {}} />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})

test('the memo is sent in one request with India times, the rows filled in and the length in seconds', async () => {
  const calls = stub([])
  const onSaved = vi.fn()
  render(<Search firId="f1" onSaved={onSaved} />)
  await screen.findByText('No search memo yet.')
  const form = fillMemo()
  fireEvent.click(screen.getByRole('button', { name: 'Add a witness' }))
  fill(screen.getByRole('group', { name: 'Witness 3' }), 'Name', '  ')   // an empty row is left out
  fireEvent.click(screen.getByRole('button', { name: 'Add a recording' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add an item' }))
  const i1 = screen.getByRole('group', { name: 'Item 1' })
  fill(i1, 'Label', 'E-03'); fill(i1, 'Description', 'Fictional phone'); fill(i1, 'Seal number', '214/E-03')
  fill(screen.getByRole('group', { name: 'Recording 1' }), 'eSakshya recording ID', 'ES-1')
  fireEvent.submit(form)
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/firs/f1/searches')
  expect(post.body).toEqual({
    place: 'Fictional house', grounds: 'Fictional grounds of the search', startedAt: '2026-10-21T07:00:00+05:30', endedAt: '2026-10-21T07:40:00+05:30',
    noWitnessReason: null,
    witnesses: [{ name: 'Fictional Neighbour', address: 'Fictional lane 1' }, { name: 'Fictional Shopkeeper', address: 'Fictional lane 2' }],
    recordings: [{ sha256: SHA, seconds: 221, esakshyaId: 'ES-1' }],
    items: [{ label: 'E-03', description: 'Fictional phone', kind: 'physical', sealNo: '214/E-03', sha256: null }],
  })
  expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2)   // the list is read again
  expect(screen.queryByRole('group', { name: 'Witness 3' })).toBeNull()   // the form starts again with two witness rows
})

test('a bad length or hash is caught before sending, and a refusal of the server is shown', async () => {
  const calls = stub([], { status: 400, message: 'Name two witnesses of the locality, or write why there are fewer (BNSS 103(4), at least 10 characters).' })
  render(<Search firId="f1" onSaved={() => {}} />)
  await screen.findByText('No search memo yet.')
  const form = fillMemo()
  const r1 = screen.getByRole('group', { name: 'Recording 1' })
  fill(r1, 'Length (minutes:seconds)', '341')
  fireEvent.submit(form)
  expect((await screen.findByRole('alert')).textContent).toBe("Write each recording's length as minutes:seconds, for example 3:41.")
  fill(r1, 'Length (minutes:seconds)', '3:41'); fill(r1, 'SHA-256 of the file', 'abc')
  fireEvent.submit(form)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Each recording needs the 64-character SHA-256 of its file.'))
  expect(calls.some((c) => c.method === 'POST')).toBe(false)
  fill(r1, 'SHA-256 of the file', SHA)
  fill(form, 'If there are fewer than two witnesses, why', 'Fictional reason')
  fireEvent.submit(form)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Name two witnesses'))
  expect(calls.find((c) => c.method === 'POST')?.body?.noWitnessReason).toBe('Fictional reason')
})

test('the day the recording was sent is recorded for one memo, and a refusal is shown', async () => {
  const calls = stub()
  const onSaved = vi.fn()
  render(<Search firId="f1" onSaved={onSaved} />)
  const form = await screen.findByRole('form', { name: 'Record that the recording was sent' })
  fill(form, 'Date sent', '2026-10-22')
  fill(form, 'Sent to (Magistrate)', ' Fictional JMFC ')
  fireEvent.submit(form)
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/firs/f1/searches/m1/forwarded', body: { date: '2026-10-22', to: 'Fictional JMFC' } })
  cleanup()
  stub([memo({})], { status: 409, message: 'It is already recorded when this recording was sent.' })
  render(<Search firId="f1" onSaved={() => {}} />)
  const again = await screen.findByRole('form', { name: 'Record that the recording was sent' })
  fill(again, 'Date sent', '2026-10-22'); fill(again, 'Sent to (Magistrate)', 'Fictional JMFC')
  fireEvent.submit(again)
  expect((await screen.findByRole('alert')).textContent).toBe('It is already recorded when this recording was sent.')
})
