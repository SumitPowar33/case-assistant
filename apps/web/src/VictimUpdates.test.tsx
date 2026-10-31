// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import VictimUpdates from './VictimUpdates'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(updates: unknown, write: { status: number; body: unknown } = { status: 201, body: { id: 'v1' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => updates }
  }))
  return writes
}

const given = [{ given_on: '2026-10-20', told_to: 'victim', means: 'phone', recorded_by_name: 'SI Fictional' }]

test('the progress updates given are listed and a new one is sent with who was told and how, never a name', async () => {
  const writes = stub([])
  const saved = vi.fn()
  render(<VictimUpdates firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText('No progress update recorded yet.')).toBeTruthy()
  const form = screen.getByText('Record a progress update given').closest('details')!
  fireEvent.change(within(form).getByLabelText('Day given'), { target: { value: '2026-10-21' } })
  fireEvent.change(within(form).getByLabelText('Told to'), { target: { value: 'informant' } })
  fireEvent.change(within(form).getByLabelText('How'), { target: { value: 'sms' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/victim-updates', body: { givenOn: '2026-10-21', toldTo: 'informant', means: 'sms' } }])
  cleanup()
  stub(given)
  render(<VictimUpdates firId="f1" version={1} onSaved={saved} />)
  expect(await screen.findByText('2026-10-20: told the victim by phone (recorded by SI Fictional)')).toBeTruthy()
})

test('a refusal is shown; a failed load is shown', async () => {
  stub([], { status: 400, body: { message: 'The update cannot be before the FIR was registered.' } })
  render(<VictimUpdates firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record a progress update given')).closest('details')!
  fireEvent.change(within(form).getByLabelText('Day given'), { target: { value: '2020-01-01' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  expect((await within(form).findByRole('alert')).textContent).toContain('before the FIR was registered')
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
  render(<VictimUpdates firId="f1" version={0} onSaved={() => {}} />)
  expect((await screen.findByRole('alert')).textContent).toContain('404')
})

test('in Marathi the list and the form are in Marathi', async () => {
  stub(given)
  render(<ScreenLangContext.Provider value="mr"><VictimUpdates firId="f1" version={0} onSaved={() => {}} /></ScreenLangContext.Provider>)
  expect(await screen.findByText('2026-10-20: पीडित यांना फोनवर सांगितले (नोंद SI Fictional)')).toBeTruthy()
  expect(screen.getByText('दिलेली प्रगतीची माहिती नोंदवा')).toBeTruthy()
  expect(screen.getByRole('option', { name: 'एसएमएसद्वारे' })).toBeTruthy()
})
