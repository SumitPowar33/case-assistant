// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ClosureReport from './ClosureReport'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(list: unknown[], writes: { url: string; body: unknown }[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 201, json: async () => ({ id: 'r1' }) }
    }
    return { ok: true, status: 200, json: async () => list }
  }))
}

test('the closure report is sent with its ground and reason; an empty informed date is sent as null', async () => {
  const writes: { url: string; body: unknown }[] = []
  stub([], writes)
  const saved = vi.fn()
  render(<ClosureReport firId="f1" version={0} onSaved={saved} />)
  const form = (await screen.findByText(/Record a closure report/)).closest('details')!
  fireEvent.change(within(form).getByLabelText('Filed on'), { target: { value: '2026-10-20' } })
  fireEvent.change(within(form).getByLabelText('Court'), { target: { value: 'Fictional JMFC Court' } })
  fireEvent.change(within(form).getByLabelText('Report number'), { target: { value: 'FR-1' } })
  fireEvent.change(within(form).getByLabelText('Ground'), { target: { value: 'untraced' } })
  fireEvent.change(within(form).getByLabelText('Reason in your words'), { target: { value: 'accused could not be traced' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/closure-report', body: {
    filedOn: '2026-10-20', court: 'Fictional JMFC Court', reportNo: 'FR-1', ground: 'untraced', reason: 'accused could not be traced', informantInformedOn: null } }])
})

test('a recorded closure report is shown and the form is gone', async () => {
  stub([{ id: 'r1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'FR-1', ground: 'insufficient_evidence',
    reason: 'no witness supports the complaint', informant_informed_on: null, recorded_by_name: 'SI Fictional', corrected: false, decision: null, decided_on: null, decision_note: null }], [])
  render(<ClosureReport firId="f1" version={0} onSaved={vi.fn()} />)
  expect(await screen.findByText(/FR-1: filed on 2026-10-20 in Fictional JMFC Court\. Not enough evidence\. Reason: no witness supports the complaint/)).toBeTruthy()
  expect(screen.getByText(/not yet recorded as told/)).toBeTruthy()
  expect(screen.queryByText(/Record a closure report/)).toBeNull()
})

const recorded = { id: 'r1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'FR-1', ground: 'untraced', reason: 'accused could not be traced',
  informant_informed_on: null, recorded_by_name: 'SI Fictional', corrected: false, decision: null, decided_on: null, decision_note: null }

test('the Magistrate decision and a correction are sent with their reasons', async () => {
  const writes: { url: string; body: unknown }[] = []
  stub([recorded], writes)
  render(<ClosureReport firId="f1" version={0} onSaved={vi.fn()} />)
  const dec = (await screen.findByText(/Record the Magistrate's decision/)).closest('details')!
  fireEvent.change(within(dec).getByLabelText('Decision'), { target: { value: 'further_investigation' } })
  fireEvent.change(within(dec).getByLabelText('Decided on'), { target: { value: '2026-10-22' } })
  fireEvent.click(within(dec).getByRole('button', { name: 'Save' }))
  const fix = screen.getByText(/Correct this closure report/).closest('details')!
  fireEvent.change(within(fix).getByLabelText('Report number'), { target: { value: 'FR-1A' } })
  fireEvent.change(within(fix).getByLabelText('Why this is being corrected'), { target: { value: 'report number was wrong' } })
  fireEvent.click(within(fix).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/closure-report/decision', body: { decision: 'further_investigation', decidedOn: '2026-10-22', note: null } })
  expect(writes[1]).toEqual({ url: '/api/firs/f1/closure-report/corrections', body: {
    filedOn: '2026-10-20', court: 'Fictional JMFC Court', reportNo: 'FR-1A', ground: 'untraced', reason: 'accused could not be traced',
    informantInformedOn: null, correctionReason: 'report number was wrong' } })
})

test('a recorded decision is shown and its form is gone', async () => {
  stub([{ ...recorded, decision: 'accepted', decided_on: '2026-10-22', decision_note: 'order 5' }], [])
  render(<ClosureReport firId="f1" version={0} onSaved={vi.fn()} />)
  expect(await screen.findByText(/Magistrate accepted the report on 2026-10-22\. order 5/)).toBeTruthy()
  expect(screen.queryByText(/Record the Magistrate's decision/)).toBeNull()
})
