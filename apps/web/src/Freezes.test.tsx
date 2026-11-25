// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Freezes from './Freezes'
import { setSession } from './api'
import { noticePrompt } from './noticePrompt'

// Fictional banks and accounts only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const step = (reference: string, reason: string | null = null) => ({ on_date: '2026-11-02', reference, reason, recorded_by: 'SI Fictional', recorded_at: '2026-11-02T10:00:00Z' })
const freeze = (steps = {}, due = '2026-11-02') => ({ id: 'n1', addressee: 'Nodal Officer, Fictional Bank', accounts: '["FICT 0000 4471","FICT00005588"]', status: 'sent',
  issued_at: '2026-11-01T04:30:00Z', report_due_on: due, held_paise: 620000, steps })

function stub(list: unknown[]) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { writes.push({ url, body: JSON.parse(init.body as string) }); return { ok: true, status: 201, json: async () => ({ id: 's1' }) } }
    return { ok: true, status: 200, json: async () => list }
  }))
  return writes
}

test('a sent freeze shows its accounts, what the bank holds and the report due; the report is recorded with its court', async () => {
  const writes = stub([freeze({}, '2000-01-01')])
  render(<Freezes firId="f1" />)
  const card = await screen.findByRole('listitem', { name: 'To Nodal Officer, Fictional Bank' })
  expect(within(card).getByText('FICT 0000 4471')).toBeTruthy()
  expect(within(card).getByText('The bank holds Rs 6,200 on these accounts (from the money trail).')).toBeTruthy()
  expect(within(card).getByText('Report to the Magistrate due by 2000-01-01').className).toContain('c-crit')   // overdue
  expect(within(card).queryByText('Record the release')).toBeNull()   // a release follows the report
  fireEvent.click(within(card).getByText('Record the report to the Magistrate'))
  fireEvent.change(within(card).getByLabelText('Date'), { target: { value: '2026-11-02' } })
  fireEvent.change(within(card).getByLabelText('Court of the Magistrate'), { target: { value: 'Fictional JMFC Court' } })
  fireEvent.submit(within(card).getByRole('button', { name: 'Save' }).closest('form')!)
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/freezes/n1/steps', body: { kind: 'reported', onDate: '2026-11-02', reference: 'Fictional JMFC Court', reason: null } })
})

test('after the report the release is offered; a released freeze shows both steps as written', async () => {
  stub([freeze({ reported: step('Fictional JMFC Court') })])
  render(<Freezes firId="f1" />)
  expect(await screen.findByText('Reported to Fictional JMFC Court on 2026-11-02 (recorded by SI Fictional)')).toBeTruthy()
  expect(screen.getByText('Record the release')).toBeTruthy()
  cleanup()
  stub([freeze({ reported: step('Fictional JMFC Court'), released: step('Order 12/2026', 'Fictional court order to release') })])
  render(<Freezes firId="f1" />)
  expect(await screen.findByText('Released on 2026-11-02, Order 12/2026: “Fictional court order to release” (recorded by SI Fictional)')).toBeTruthy()
  expect(screen.queryByText('Record the release')).toBeNull()
})

test('no freeze yet says how to make one', async () => {
  stub([])
  render(<Freezes firId="f1" />)
  expect(await screen.findByText('No freeze notice has been sent yet.')).toBeTruthy()
})

test('the AI draft of a freeze notice names the bank and lists the accounts to freeze', () => {
  const p = noticePrompt({ kind: 'BNSS_106', kindLabel: 'BNSS 106: freeze bank accounts (seizure)', addressee: 'Nodal Officer, Fictional Bank', items: ['FICT 0000 4471'] })
  expect(p).toContain('Addressed to: Nodal Officer, Fictional Bank.')
  expect(p).toContain('Accounts to be frozen against debits until further orders, listed exactly as given, one per line:\n- FICT 0000 4471')
})
