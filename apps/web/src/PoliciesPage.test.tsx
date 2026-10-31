// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import PoliciesPage from './PoliciesPage'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', can_set_policy: true } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const lists: Record<string, unknown> = {
  '/policies': [{ key: 'victim_update_days', label: 'Victim update days', default: 90, min: 7, max: 90, effective: 60 }],
  '/policy-settings': [
    { id: 'p1', level: 'station', state_code: 'IN', district: null, station_name: 'Demo Cyber PS', key: 'victim_update_days', value: 60, reason: 'Fictional audit finding', set_by_name: 'SHO One', set_at: '2026-10-25T10:00:00Z' },
    { id: 'p2', level: 'state', state_code: 'IN', district: null, station_name: null, key: 'session_hours', value: 6, reason: 'Fictional state rule', set_by_name: 'State Admin', set_at: '2026-10-25T11:00:00Z' },
    { id: 'p3', level: 'district', state_code: 'IN', district: 'Demo District', station_name: null, key: 'session_hours', value: 5, reason: 'Fictional district rule', set_by_name: 'SP One', set_at: '2026-10-25T12:00:00Z' },
  ],
  '/stations': [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS' }, { id: 's2', state_code: 'IN', district: 'Demo District', name: 'Demo Town PS' }],
  '/state-packs': [{ code: 'IN', name: 'National' }],
}

function stub(write = { status: 201, body: {} as unknown }, fail = false) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    const key = url.replace('/api', '')
    if (fail) return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => lists[key] ?? [] }
  }))
  return writes
}
const fill = (reason = 'Fictional supervisor request') => {
  fireEvent.change(screen.getByLabelText('New value'), { target: { value: '45' } })
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: reason } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

test('shows the value in force and the recent changes at every level', async () => {
  stub()
  render(<PoliciesPage />)
  expect(await screen.findByText('Victim update days')).toBeTruthy()
  expect(screen.getByText('7 to 90')).toBeTruthy()
  expect(screen.getByText(/victim_update_days set to 60 for Demo Cyber PS \(station\) by SHO One/)).toBeTruthy()
  expect(screen.getByText(/session_hours set to 6 for IN \(state\)/)).toBeTruthy()
  expect(screen.getByText(/session_hours set to 5 for Demo District \(district\)/)).toBeTruthy()
})

test('tightening a station policy sends the station, value and reason', async () => {
  const writes = stub()
  render(<PoliciesPage />)
  await screen.findByText('Victim update days')
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 's2' } })
  fill()
  expect((await screen.findByRole('status')).textContent).toMatch(/Saved/)
  expect(writes).toEqual([{ url: '/api/policy-settings', body: { level: 'station', stationId: 's2', key: 'victim_update_days', value: 45, reason: 'Fictional supervisor request' } }])
})

test('district and state levels send their own unit fields', async () => {
  const writes = stub()
  render(<PoliciesPage />)
  await screen.findByText('Victim update days')
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'district' } })
  fill()
  await screen.findByRole('status')
  fireEvent.change(screen.getByLabelText('Level'), { target: { value: 'state' } })
  fill()
  await screen.findByRole('status')
  expect(writes.map((w) => w.body)).toEqual([
    { level: 'district', stateCode: 'IN', district: 'Demo District', key: 'victim_update_days', value: 45, reason: 'Fictional supervisor request' },
    { level: 'state', stateCode: 'IN', key: 'victim_update_days', value: 45, reason: 'Fictional supervisor request' },
  ])
})

test('the server refusal (looser than the unit above) is shown and nothing is claimed saved', async () => {
  stub({ status: 409, body: { message: 'The unit above already asks for 30 or less; a unit can only be stricter, never looser.' } })
  render(<PoliciesPage />)
  await screen.findByText('Victim update days')
  fill()
  expect((await screen.findByRole('alert')).textContent).toMatch(/never looser/)
  expect(screen.queryByRole('status')).toBeNull()
})

test('a load failure is shown; an empty history says so', async () => {
  stub(undefined, true)
  render(<PoliciesPage />)
  expect((await screen.findByRole('alert')).textContent).toMatch(/500/)
  cleanup()
  lists['/policy-settings'] = []
  stub()
  render(<PoliciesPage />)
  expect(await screen.findByText('No changes you may see.')).toBeTruthy()
})

test('the form is not offered to someone who cannot set policies, but the values in force are shown', async () => {
  stub()
  setSession({ token: 't', user: { id: 'u2', username: 'io.one', full_name: 'IO One', rank: 'SI', role: 'io', station_id: 's1', can_set_policy: false } })
  render(<PoliciesPage />)
  expect(await screen.findByText('In force at your own station')).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Make a policy stricter' })).toBeNull()
})

test('in Marathi: the table, the form, the saved message and every recent change; policy keys and reasons stay as written', async () => {
  lists['/policy-settings'] = [
    { id: 'p1', level: 'station', state_code: 'IN', district: null, station_name: 'Demo Cyber PS', key: 'victim_update_days', value: 60, reason: 'Fictional audit finding', set_by_name: 'SHO One', set_at: '2026-10-25T10:00:00Z' },
    { id: 'p2', level: 'state', state_code: 'IN', district: null, station_name: null, key: 'session_hours', value: 6, reason: 'Fictional state rule', set_by_name: 'State Admin', set_at: '2026-10-25T11:00:00Z' },
    { id: 'p3', level: 'zone', state_code: 'IN', district: 'Demo District', station_name: null, key: 'session_hours', value: 5, reason: 'Fictional zone rule', set_by_name: 'SP One', set_at: '2026-10-25T12:00:00Z' },
  ]
  const writes = stub()
  render(<ScreenLangContext.Provider value="mr"><PoliciesPage /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'धोरणे' })).toBeTruthy()
  expect(screen.getByText('तुमच्या स्वतःच्या ठाण्यात लागू')).toBeTruthy()
  for (const name of ['धोरण', 'सध्याचे मूल्य', 'परवानगी असलेली मर्यादा']) expect(screen.getByRole('columnheader', { name })).toBeTruthy()
  expect(screen.getByText('7 ते 90')).toBeTruthy()
  expect(screen.getByText(/^Demo Cyber PS \(ठाणे\) साठी victim_update_days 60 केले, SHO One यांनी .* रोजी\. कारण: “Fictional audit finding”$/)).toBeTruthy()
  expect(screen.getByText(/^IN \(राज्य\) साठी session_hours 6 केले/)).toBeTruthy()
  expect(screen.getByText(/^Demo District \(zone\) साठी/)).toBeTruthy()   // a level the screen does not know shows its code
  const form = screen.getByRole('form', { name: 'धोरण अधिक कडक करा' })
  for (const name of ['राज्य', 'जिल्हा', 'पोलीस ठाणे']) expect(within(form).getByRole('option', { name })).toBeTruthy()
  fireEvent.change(within(form).getByLabelText('नवीन मूल्य'), { target: { value: '45' } })
  fireEvent.change(within(form).getByLabelText('कारण (किमान 10 अक्षरे)'), { target: { value: 'Fictional supervisor request' } })
  fireEvent.change(within(form).getByLabelText('स्तर'), { target: { value: 'district' } })
  fireEvent.click(within(form).getByRole('button', { name: 'जतन करा' }))
  expect((await screen.findByRole('status')).textContent).toBe('जतन केले. आता अधिक कडक मूल्य लागू आहे.')
  expect(writes[0].body).toEqual({ level: 'district', stateCode: 'IN', district: 'Demo District', key: 'victim_update_days', value: 45, reason: 'Fictional supervisor request' })
  cleanup()
  lists['/policy-settings'] = []
  stub()
  render(<ScreenLangContext.Provider value="ta"><PoliciesPage /></ScreenLangContext.Provider>)
  expect(await screen.findByText('நீங்கள் காணக்கூடிய மாற்றம் எதுவும் இல்லை.')).toBeTruthy()
})
