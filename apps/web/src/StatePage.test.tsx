// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import StatePage from './StatePage'
import { setSession } from './api'

// Fictional data only.
const user = { id: 'u1', username: 'nodal.one', full_name: 'Nodal One', rank: 'SP', role: 'state_admin', station_id: 's1' as string | null, permissions: ['pack.propose'] }
beforeEach(() => setSession({ token: 't', user }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const pack = { code: 'MH', name: 'Fictional Maharashtra', version: '3.2', languages: ['mr', 'hi', 'en'], status: 'pilot' }
const change = (extra = {}) => ({ id: 'c1', title: 'Fictional playbook v1.5', body: 'Adds a fictional front desk step.', tested_note: 'Tried on 40 fictional cases', drafted_at: '2026-11-01T04:30:00Z',
  drafted_by_name: 'SP Fictional Cyber', drafted_by_rank: 'SP', decision: null, decision_note: null, decided_at: null, decided_by_name: null, decided_by_rank: null, can_decide: false, ...extra })

function stub(initial: unknown, after?: unknown, failPost?: string) {
  const calls: { url: string; method: string; body?: Record<string, string> }[] = []
  let posted = false
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined })
    if (method === 'POST') {
      if (failPost) return { ok: false, status: 409, json: async () => ({ message: failPost }) }
      posted = true
      return { ok: true, status: 201, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => (posted && after ? after : initial) }
  }))
  return calls
}

test('the pack, its languages and the changes with their state are shown; the proposal form sends the pack of the state and loads the list again', async () => {
  const calls = stub({ pack, changes: [change({ decision: 'approved', decision_note: 'Checked (fictional)', decided_at: '2026-11-02T04:30:00Z', decided_by_name: 'Adv Fictional', decided_by_rank: 'PP' })], can_propose: true },
    { pack, changes: [change({ id: 'c2', title: 'Fictional second change' }), change()], can_propose: true })
  render(<StatePage />)
  expect(await screen.findByRole('heading', { name: 'Fictional Maharashtra, version 3.2' })).toBeTruthy()
  expect(screen.getByText('Pilot')).toBeTruthy()
  expect(screen.getByText('Languages: mr, hi, en')).toBeTruthy()
  const card = screen.getByRole('article', { name: 'Fictional playbook v1.5' })
  expect(card.textContent).toContain('Approved')
  expect(card.textContent).toContain('Decided by Adv Fictional (PP)')
  expect(card.textContent).toContain('Checked (fictional)')
  expect(card.textContent).toContain('Tested: Tried on 40 fictional cases')
  expect(within(card).queryByRole('button', { name: 'Approve' })).toBeNull()
  expect(calls[0].url).toBe('/api/pack-changes')
  fireEvent.change(screen.getByLabelText('Short title'), { target: { value: ' Fictional second change ' } })
  fireEvent.change(screen.getByLabelText('What changes'), { target: { value: 'Fictional text long enough to send.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
  expect(await screen.findByRole('article', { name: 'Fictional second change' })).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/pack-changes', method: 'POST', body: { state: 'MH', title: 'Fictional second change', body: 'Fictional text long enough to send.', testedNote: '' } })
  expect((screen.getByLabelText('Short title') as HTMLInputElement).value).toBe('')
})

test('without the right to propose there is no form; an empty list says so', async () => {
  stub({ pack, changes: [], can_propose: false })
  render(<StatePage />)
  expect(await screen.findByText('No change has been proposed.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Send for approval' })).toBeNull()
})

test('the approver approves with a note, or sends back; the buttons exist only where the server says the person may decide', async () => {
  const calls = stub({ pack, changes: [change({ can_decide: true }), change({ id: 'c3', title: 'Fictional other change', can_decide: false })], can_propose: false },
    { pack, changes: [change({ decision: 'returned', decision_note: 'Add the second link rule', decided_at: '2026-11-02T04:30:00Z', decided_by_name: 'Adv Fictional', decided_by_rank: 'PP' })], can_propose: false })
  render(<StatePage />)
  const card = await screen.findByRole('article', { name: 'Fictional playbook v1.5' })
  expect(card.textContent).toContain('Waiting for a decision')
  expect(within(screen.getByRole('article', { name: 'Fictional other change' })).queryByRole('button', { name: 'Approve' })).toBeNull()
  fireEvent.change(within(card).getByLabelText(/^Note/), { target: { value: ' Add the second link rule ' } })
  fireEvent.click(within(card).getByRole('button', { name: 'Send back' }))
  await waitFor(() => expect(screen.getByRole('article', { name: 'Fictional playbook v1.5' }).textContent).toContain('Sent back'))
  expect(calls.find((c) => c.method === 'POST')).toEqual({ url: '/api/pack-changes/c1/decision', method: 'POST', body: { decision: 'return', note: 'Add the second link rule' } })
})

test('approving sends approve; a refusal of the server is shown on the card and the buttons stay', async () => {
  const calls = stub({ pack, changes: [change({ can_decide: true })], can_propose: false }, undefined, 'This change has been decided already.')
  render(<StatePage />)
  const card = await screen.findByRole('article', { name: 'Fictional playbook v1.5' })
  fireEvent.click(within(card).getByRole('button', { name: 'Approve' }))
  expect((await within(card).findByRole('alert')).textContent).toContain('This change has been decided already.')
  expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ decision: 'approve', note: '' })
  expect(within(card).getByRole('button', { name: 'Approve' })).toBeTruthy()
})

test('a refused proposal shows the server answer and keeps the form; a refused list shows the error', async () => {
  stub({ pack, changes: [], can_propose: true }, undefined, 'Not allowed.')
  render(<StatePage />)
  fireEvent.change(await screen.findByLabelText('Short title'), { target: { value: 'Fictional title' } })
  fireEvent.change(screen.getByLabelText('What changes'), { target: { value: 'Fictional text long enough to send.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Not allowed.')
  expect((screen.getByLabelText('Short title') as HTMLInputElement).value).toBe('Fictional title')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })))
  render(<StatePage />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})

test('an account without a police station names the state first; nothing is loaded for a code that is not two or three letters', async () => {
  setSession({ token: 't', user: { ...user, station_id: null } })
  const calls = stub({ pack, changes: [], can_propose: true })
  render(<StatePage />)
  expect(calls).toHaveLength(0)
  const input = screen.getByLabelText('State code (for example MH)')
  fireEvent.change(input, { target: { value: 'm' } })
  expect(calls).toHaveLength(0)
  fireEvent.change(input, { target: { value: 'mh' } })
  expect(await screen.findByRole('heading', { name: 'Fictional Maharashtra, version 3.2' })).toBeTruthy()
  expect(calls[0].url).toBe('/api/pack-changes?state=MH')
  expect(await screen.findByRole('button', { name: 'Send for approval' })).toBeTruthy()
})
