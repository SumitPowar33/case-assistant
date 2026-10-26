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
    reason: 'no witness supports the complaint', informant_informed_on: null, recorded_by_name: 'SI Fictional' }], [])
  render(<ClosureReport firId="f1" version={0} onSaved={vi.fn()} />)
  expect(await screen.findByText(/FR-1: filed on 2026-10-20 in Fictional JMFC Court\. Not enough evidence\. Reason: no witness supports the complaint/)).toBeTruthy()
  expect(screen.getByText(/not yet recorded as told/)).toBeTruthy()
  expect(screen.queryByText(/Record a closure report/)).toBeNull()
})
