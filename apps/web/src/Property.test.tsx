// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Property from './Property'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'hc.fictional', full_name: 'HC Fictional', rank: 'HC', role: 'malkhana', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const item = (over: object) => ({
  id: 'i1', fir_id: 'f1', fir_no: 7, fir_year: 2026, label: '7/P-01', description: 'Fictional knife', station: 'Fictional PS',
  moved_at: '2026-10-03T11:00:00Z', location: 'Fictional malkhana', place: 'malkhana', seal_intact: true, status: 'in_malkhana', ...over,
})
const register = {
  items: [
    item({}),
    item({ id: 'i2', label: '7/P-02', description: 'Fictional bag', status: 'out', place: 'lab', location: 'Fictional lab', seal_intact: false }),
    item({ id: 'i3', label: '7/P-03', description: 'Fictional cash', moved_at: null, location: null, place: null, seal_intact: null, status: 'not_logged' }),
    item({ id: 'i4', label: '7/P-04', description: 'Fictional coat', status: 'weird' }),
  ],
  counts: { in_malkhana: 1, out: 1, released: 0 }, truncated: false,
}
const moves = [
  { at: '2026-10-03T11:00:00Z', handed_by: 'SI Fictional', received_by: 'HC Fictional Store', location: 'Fictional malkhana', purpose: 'deposit', seal_intact: true, place: 'malkhana' },
  { at: '2026-10-05T09:30:00Z', handed_by: 'HC Fictional Store', received_by: 'Fictional lab clerk', location: 'Fictional lab', purpose: 'analysis', seal_intact: false, place: null },
]

function stub(load: unknown = register, history: unknown = moves, write = { status: 201 }) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => ({ message: 'Only the case team can do this.' }) }
    return { ok: true, status: 200, json: async () => (url.includes('/custody') ? history : load) }
  }))
  return calls
}

test('the register shows each item with its case, newest place and a status word, and the counts', async () => {
  stub()
  render(<Property />)
  const table = await screen.findByRole('table', { name: 'Seized items' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(5)
  expect(rows[1].textContent).toContain('FIR 7/2026')
  expect(rows[1].textContent).toContain('Fictional malkhana')
  expect(rows[1].textContent).toContain('2026-10-03')
  expect(within(rows[1]).getByText('In malkhana', { selector: '.chip' })).toBeTruthy()
  expect(rows[2].textContent).toContain('Seal not intact')
  expect(rows[2].textContent).toContain('At a lab or court')
  expect(rows[3].textContent).toContain('—')
  expect(rows[3].textContent).toContain('No hand-over written')
  expect(rows[4].textContent).toContain('weird')   // a status the screen does not know is shown as it is
  expect(screen.getByText('In malkhana: 1')).toBeTruthy()
  expect(screen.getByText('At a lab or court: 1')).toBeTruthy()
  expect(screen.getByText('Returned to owner: 0')).toBeTruthy()
  expect(screen.queryByText('Only the newest 500 items are shown.')).toBeNull()
})

test('a cut list says so, and an empty one says there is nothing', async () => {
  stub({ ...register, truncated: true, counts: {} })
  render(<Property />)
  expect(await screen.findByText('Only the newest 500 items are shown.')).toBeTruthy()
  expect(screen.getByText('In malkhana: 0')).toBeTruthy()
  cleanup()
  stub({ items: [], counts: {}, truncated: false })
  render(<Property />)
  expect(await screen.findByText('No seized property to show.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
  cleanup()
  stub({})   // an answer of another shape does not crash the screen
  render(<Property />)
  expect(await screen.findByText('No seized property to show.')).toBeTruthy()
})

test('picking an item shows its hand-overs, oldest first, and a link to its case', async () => {
  stub()
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '7/P-01' }))
  const table = await screen.findByRole('table', { name: 'Hand-overs of 7/P-01' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(rows[1].textContent).toContain('2026-10-03 11:00')
  expect(rows[1].textContent).toContain('SI Fictional')
  expect(rows[1].textContent).toContain('deposit')
  expect(rows[2].textContent).toContain('Seal not intact')
  expect(rows[2].textContent).not.toContain('Elsewhere')   // no place stated on that hand-over
  expect(screen.getByRole('link', { name: 'Open FIR 7/2026' }).getAttribute('href')).toBe('#/firs/f1/evidence')
})

test('a hand-over is sent to the custody route of the item, with the place, then the register is read again', async () => {
  const calls = stub()
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '7/P-01' }))
  const form = (await screen.findByRole('heading', { name: 'Record a hand-over' })).closest('form')!
  const field = (label: string) => within(form).getByLabelText(new RegExp(label))
  fireEvent.change(field('Handed over by'), { target: { value: 'HC Fictional Store' } })
  fireEvent.change(field('Received by'), { target: { value: 'Fictional court clerk' } })
  fireEvent.change(field('Where'), { target: { value: 'Fictional court' } })
  fireEvent.change(field('Place now'), { target: { value: 'court' } })
  fireEvent.change(field('Why'), { target: { value: 'produced' } })
  fireEvent.click(field('Seal intact'))   // the box starts ticked: this un-ticks it
  fireEvent.submit(form)
  await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/firs/f1/evidence/i1/custody')
  expect(post.body).toMatchObject({ handedBy: 'HC Fictional Store', receivedBy: 'Fictional court clerk', location: 'Fictional court', purpose: 'produced', place: 'court', sealIntact: false })
  expect(typeof post.body!.at).toBe('string')
  await waitFor(() => expect(calls.filter((c) => c.url === '/api/property').length).toBeGreaterThan(1))
})

test('the reason is shown when the server refuses a hand-over, and a failed read shows its error', async () => {
  const calls = stub(register, moves, { status: 403 })
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '7/P-02' }))
  const form = (await screen.findByRole('heading', { name: 'Record a hand-over' })).closest('form')!
  for (const label of ['Handed over by', 'Received by', 'Where', 'Why']) fireEvent.change(within(form).getByLabelText(new RegExp(label)), { target: { value: 'Fictional' } })
  fireEvent.submit(form)
  expect((await screen.findByRole('alert')).textContent).toContain('Only the case team can do this.')
  expect(calls.filter((c) => c.url === '/api/property')).toHaveLength(1)
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<Property />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})

test('an item with no hand-over yet says so, and a failed history read shows its error', async () => {
  stub(register, [])
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '7/P-03' }))
  expect(await screen.findByText('None yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/custody')
    ? { ok: false, status: 403, json: async () => ({}) } : { ok: true, status: 200, json: async () => register }))
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '7/P-01' }))
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})
