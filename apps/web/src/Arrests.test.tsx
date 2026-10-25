// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Arrests from './Arrests'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(lists: Record<string, unknown>, write: { status: number; body: unknown } = { status: 201, body: { id: 'a9' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  return writes
}
const type = (label: string | RegExp, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } })

const people = [
  { id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional Accused' },
  { id: 'p2', role: 'witness', label: 'W1', display_name: 'Fictional Witness' },
]
const base = {
  person_label: 'A1', arrested_at: '2026-09-12T02:30:00Z', place: 'Testpur', grounds: ['to prevent further offence', 'proper investigation'],
  informed_name: 'Fictional Relative', informed_contact: null, arresting_officer_name: 'SI Fictional', max_punishment: 'less_than_10_years',
  remand_recorded_by_name: null,
}

test('an arrest shows its own chargesheet last day; one without a remand asks for it', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', remand_recorded_by_name: 'SI Fictional' },
    { ...base, id: 'a2', max_punishment: 'life', first_remand_on: null, chargesheet_last_day: null },
  ] }, { status: 204, body: null })
  const saved = vi.fn()
  render(<Arrests firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText('2026-11-10')).toBeTruthy()
  expect(screen.getByText(/chargesheet within 60 days/)).toBeTruthy()
  expect(screen.getAllByText(/arrested 12 Sept? 2026, 8:00 am IST at Testpur by SI Fictional/i)).toHaveLength(2)
  expect(screen.getByText(/First remand not recorded yet/)).toBeTruthy()
  const form = screen.getByText('Record the first remand').closest('details')!
  type(/Date of first remand/, '2026-09-13', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes[0]).toEqual({ url: '/api/firs/f1/arrests/a2/first-remand', body: { firstRemandOn: '2026-09-13' } })
})

test('the arrest form offers only accused, needs grounds and sends India time', async () => {
  const writes = stub({ '/firs/f1/people': people })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record an arrest (BNSS 35 memo)')).closest('details')!
  const options = within(form).getAllByRole('option').map((o) => o.textContent)
  expect(options).toContain('A1: Fictional Accused')
  expect(options.some((o) => o?.startsWith('W1'))).toBe(false)
  type(/^Arrested/, '2026-09-12T08:00', within(form)); type('Place of arrest', 'Testpur', within(form))
  type(/Relative or friend informed/, 'Fictional Relative', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  expect((await within(form).findByRole('alert')).textContent).toMatch(/grounds of arrest/)
  expect(writes).toHaveLength(0)
  type(/Grounds of arrest/, 'to prevent further offence\n\nproper investigation', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/arrests', body: {
    personId: 'p1', arrestedAt: '2026-09-12T08:00:00+05:30', place: 'Testpur', grounds: ['to prevent further offence', 'proper investigation'],
    informedName: 'Fictional Relative', informedContact: null, maxPunishment: 'less_than_10_years', firstRemandOn: null } })
})

test('with no accused yet, the form is not shown', async () => {
  stub({ '/firs/f1/people': [people[1]] })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  expect(await screen.findByText(/only an accused can be arrested/)).toBeTruthy()
})
