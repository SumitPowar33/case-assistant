// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Statements from './Statements'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const data = {
  witnesses: [
    { person_id: 'p1', role: 'witness', label: 'W1', name: 'Fictional Son', statements: 1 },
    { person_id: 'p2', role: 'witness', label: 'W2', name: 'Fictional Nodal Officer', statements: 0 },
  ],
  statements: [{ id: 's1', person_id: 'p1', label: 'W1', name: 'Fictional Son', recorded_at: '2026-11-02T04:30:00Z', recorded_by_name: 'SI Fictional', language: 'mr', medium: 'video', original_text: 'बाबा व्हिडिओ कॉलवर होते.' }],
}

function stub(write: { status: number; body: unknown } = { status: 201, body: {} }, load: unknown = data) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => write.body }
    return { ok: true, status: 200, json: async () => load }
  }))
  return calls
}

test('the tracker shows who is recorded, the statement is shown as said, and a new one is sent for the chosen person', async () => {
  const calls = stub()
  render(<Statements firId="f1" />)
  expect(await screen.findByText('बाबा व्हिडिओ कॉलवर होते.')).toBeTruthy()
  expect(screen.getByText('Recorded')).toBeTruthy()
  expect(screen.getByText('Not recorded')).toBeTruthy()
  expect(screen.getByText('MR')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Who made the statement'), { target: { value: 'p2' } })
  fireEvent.change(screen.getByLabelText('How it was recorded'), { target: { value: 'audio' } })
  fireEvent.change(screen.getByLabelText('The statement, in the words and language spoken'), { target: { value: 'The bank records were sent on 22 August.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/firs/f1/statements', body: { personId: 'p2', language: 'en', medium: 'audio', text: 'The bank records were sent on 22 August.' } })
})

test('the first person is chosen when nobody is picked, and a refusal from the server is shown', async () => {
  const calls = stub({ status: 400, body: { message: 'A statement is recorded for a complainant, victim or witness of this case.' } })
  render(<Statements firId="f1" />)
  await screen.findByText('Witness tracker')
  fireEvent.change(screen.getByLabelText('The statement, in the words and language spoken'), { target: { value: 'Words of the first witness' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save statement' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ personId: 'p1', medium: 'written' })
})

test('with no witnesses there is no form, only a pointer to People; an empty answer breaks nothing', async () => {
  stub(undefined, { witnesses: [], statements: [] })
  render(<Statements firId="f1" />)
  expect(await screen.findByText(/Add them under People first/)).toBeTruthy()
  expect(screen.getByText('No statement has been recorded yet.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save statement' })).toBeNull()
  cleanup()
  stub(undefined, {})
  render(<Statements firId="f1" />)
  expect(await screen.findByText('Witness tracker')).toBeTruthy()
})

test('a failed load is shown', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ message: 'No such case' }) })))
  render(<Statements firId="f1" />)
  expect(await screen.findByRole('alert')).toBeTruthy()
})
