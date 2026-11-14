// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import PocsoSteps from './PocsoSteps'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(body: unknown, write: { status: number; body: unknown } = { status: 201, body: { id: 'p1' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => body }
  }))
  return writes
}

const step = (step: string, basis: string, due: string | null, done: string | null = null) =>
  ({ step, basis, limit_hours: due ? 24 : null, due_at: due, done_at: done, recorded_by_name: done ? 'SI Fictional' : null })
const steps = [
  step('cwc_court_report', 'POCSO 19(6)', '2026-10-02T04:30:00Z', '2026-10-01T10:30:00Z'),
  step('medical_examination', 'POCSO 27; BNSS 184(1)', '2026-10-02T04:30:00Z'),
  step('statement_chosen_place', 'POCSO 24', null),
  step('magistrate_statement', 'BNSS 183; POCSO 25', null),
  step('support_person', 'POCSO Rules 2020, rule 4', null),
  step('interim_compensation', 'POCSO 33(8); POCSO Rules 2020, rule 9', null),
]

test('nothing is shown for a case that is not a POCSO case', async () => {
  const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ pocso: false, steps: [] }) }))
  vi.stubGlobal('fetch', fetch)
  const { container } = render(<PocsoSteps firId="f1" version={0} onSaved={() => {}} />)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 0))
  expect(container.textContent).toBe('')
})

test('each step is shown with its law, open steps red with their due time or no limit, done steps with when and who', async () => {
  stub({ pocso: true, steps })
  render(<PocsoSteps firId="f1" version={0} onSaved={() => {}} />)
  expect(await screen.findByRole('heading', { name: 'POCSO case: steps the law asks for' })).toBeTruthy()
  const items = screen.getAllByRole('listitem')
  expect(items).toHaveLength(6)
  expect(within(items[0]).getByText('Done').className).toContain('c-ok')
  expect(items[0].textContent).toContain('Report to the Child Welfare Committee and the Special Court')
  expect(items[0].textContent).toContain('(POCSO 19(6))')
  expect(items[0].textContent).toContain('Done 1 Oct 2026, 4:00 pm IST (recorded by SI Fictional)')
  expect(within(items[1]).getByText('Open').className).toContain('c-crit')
  expect(items[1].textContent).toContain('Due by 2 Oct 2026, 10:00 am IST')
  expect(items[2].textContent).toContain('No time limit in the law')
  expect(items[2].textContent).toContain('by a woman officer not in uniform')
  expect(screen.getByText(/never go on a paper that leaves the case file \(POCSO 23\)/)).toBeTruthy()
})

test('a step done is recorded in India time, the first open step chosen first; a refusal is shown', async () => {
  const writes = stub({ pocso: true, steps })
  const saved = vi.fn()
  render(<PocsoSteps firId="f1" version={0} onSaved={saved} />)
  const form = (await screen.findByText('Record a step done')).closest('details')!
  expect((within(form).getByLabelText('Step') as HTMLSelectElement).value).toBe('medical_examination')
  fireEvent.change(within(form).getByLabelText('Done at'), { target: { value: '2026-10-01T18:15' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/pocso-steps', body: { step: 'medical_examination', doneAt: '2026-10-01T18:15:00+05:30' } }])
  cleanup()
  stub({ pocso: true, steps }, { status: 400, body: { message: 'A step cannot be before the information was received.' } })
  render(<PocsoSteps firId="f1" version={0} onSaved={() => {}} />)
  const again = (await screen.findByText('Record a step done')).closest('details')!
  fireEvent.change(within(again).getByLabelText('Step'), { target: { value: 'support_person' } })
  fireEvent.change(within(again).getByLabelText('Done at'), { target: { value: '2026-09-01T10:00' } })
  fireEvent.click(within(again).getByRole('button', { name: 'Save' }))
  expect((await within(again).findByRole('alert')).textContent).toContain('before the information was received')
})

test('with every step done the first step is chosen; a failed load is shown', async () => {
  stub({ pocso: true, steps: steps.map((s) => ({ ...s, done_at: '2026-10-01T10:30:00Z', recorded_by_name: 'SI Fictional' })) })
  render(<PocsoSteps firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record a step done')).closest('details')!
  expect((within(form).getByLabelText('Step') as HTMLSelectElement).value).toBe('cwc_court_report')
  expect(screen.queryByText('Open')).toBeNull()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  render(<PocsoSteps firId="f1" version={0} onSaved={() => {}} />)
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})

test('in Marathi the steps and the form are in Marathi', async () => {
  stub({ pocso: true, steps })
  render(<ScreenLangContext.Provider value="mr"><PocsoSteps firId="f1" version={0} onSaved={() => {}} /></ScreenLangContext.Provider>)
  expect(await screen.findByText('पोक्सो प्रकरण: कायद्याने सांगितलेल्या पायऱ्या')).toBeTruthy()
  expect(screen.getByText('पूर्ण झालेली पायरी नोंदवा')).toBeTruthy()
  expect(screen.getAllByText('उघडी')).toHaveLength(5)
  expect(screen.getByRole('option', { name: 'दंडाधिकाऱ्यांसमोर जबाब' })).toBeTruthy()
})
