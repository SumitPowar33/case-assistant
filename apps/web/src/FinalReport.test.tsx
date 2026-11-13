// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FinalReport from './FinalReport'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const FACTS = 'On a fictional date the complainant lost money to a fictional caller.'
const particulars = { sections: 'BNS 318(4)', accused: 1, witnesses: 2, statements_from: 1, evidence_items: 3 }
const draft = (status: string, over: object = {}) => ({ id: 'd1', language: 'en', facts_text: FACTS, evidence_text: 'Fictional bank statement.', status, submitted_by: 'u1', submitted_by_name: 'SI Fictional', decided_by_name: null, signed_by_name: null, ...over })
const base = { draft: null, events: [], readinessChecked: true, openGaps: 0, canApprove: false, particulars }

function stub(load: unknown, write: { status: number; body: unknown } = { status: 200, body: {} }) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST' || init?.method === 'PUT') return { ok: write.status < 300, status: write.status, json: async () => write.body }
    return { ok: true, status: 200, json: async () => load }
  }))
  return calls
}

test('the officer writes both parts, saves the draft and submits it; the particulars come from the file', async () => {
  const calls = stub({ ...base, draft: draft('draft'), events: [{ at: '2026-11-02T04:30:00Z', action: 'saved', note: null, by_name: 'SI Fictional' }] })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText(/sections BNS 318\(4\); 1 accused; 2 witnesses; statements recorded from 1 people \(victims and witnesses\); 3 evidence items/)).toBeTruthy()
  expect(screen.getAllByText('Draft').length).toBe(1)
  fireEvent.change(screen.getByLabelText('Facts in brief'), { target: { value: FACTS + ' More.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
  expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: '/api/firs/f1/final-report', body: { language: 'en', facts: FACTS + ' More.', evidence: 'Fictional bank statement.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(true))
})

test('a new draft starts empty in the typing language, and the missing readiness check and open gaps are said before submitting', async () => {
  const calls = stub({ ...base, readinessChecked: false })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  fireEvent.change(await screen.findByLabelText('Facts in brief'), { target: { value: FACTS } })
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
  expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ language: 'en', facts: FACTS, evidence: '' })
  cleanup()
  stub({ ...base, draft: draft('returned'), openGaps: 2 })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText(/2 gap\(s\) of the readiness check are still open/)).toBeTruthy()
  cleanup()
  stub({ ...base, draft: draft('draft'), readinessChecked: false })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText(/Choose a playbook and make the readiness check/)).toBeTruthy()
})

test('the station head sees Approve and Return on a submitted report of someone else, and a return needs the reason sent along', async () => {
  const calls = stub({ ...base, canApprove: true, draft: draft('submitted', { submitted_by: 'u2', submitted_by_name: 'SI Other' }) })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  await screen.findByRole('button', { name: 'Approve' })
  expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull()
  expect(screen.queryByLabelText('Facts in brief')).toBeNull()     // the words are read-only now
  fireEvent.change(screen.getByLabelText('Reason for returning'), { target: { value: 'Add the call records.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Return' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/decision'))).toBe(true))
  expect(calls.find((c) => c.url.endsWith('/decision'))).toMatchObject({ method: 'POST', body: { decision: 'return', note: 'Add the call records.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.url.endsWith('/decision')).length).toBe(2))
  expect(calls.filter((c) => c.url.endsWith('/decision'))[1].body).toEqual({ decision: 'approve' })
})

test('nobody sees Approve on their own submission, and only the submitting officer sees Sign on an approved report', async () => {
  stub({ ...base, canApprove: true, draft: draft('submitted') })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  await screen.findByText('Submitted')
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  cleanup()
  stub({ ...base, draft: draft('approved', { submitted_by: 'u2' }) })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  await screen.findByText('Approved')
  expect(screen.queryByRole('button', { name: 'Sign the final report' })).toBeNull()
  cleanup()
  const calls = stub({ ...base, draft: draft('approved'), events: [{ at: '2026-11-02T05:00:00Z', action: 'returned', note: 'Add the call records.', by_name: 'SHO Fictional' }] })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText('Add the call records.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sign the final report' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/sign'))).toBe(true))
})

test('a signed report shows who signed it, and a refusal from the server is shown', async () => {
  stub({ ...base, draft: draft('signed', { signed_by_name: 'SI Fictional' }) })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText('Signed')).toBeTruthy()
  expect(screen.getByText(/SI Fictional/)).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
  cleanup()
  stub({ ...base, draft: draft('draft') }, { status: 409, body: { message: '2 gap(s) of the readiness check are open.' } })
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a failed load is shown as an alert', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ message: 'Boom' }) })))
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('an answer without particulars or steps still shows the page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
  render(<FinalReport firId="f1" me="u1" text="Fictional FIR text" victimProtected={false} />)
  expect(await screen.findByText(/Taken from the file: sections —; 0 accused/)).toBeTruthy()
})
