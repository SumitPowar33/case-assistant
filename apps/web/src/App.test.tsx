// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { setSession, type Session } from './api'

const io: Session = { token: 'tok-io', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional Rao', rank: 'SI', role: 'io', station_id: 's1', permissions: ['fir.register', 'case.lead'], case_scope: 'none' } }

const fir = { id: 'f1', fir_year: 2026, fir_no: 7, registered_at: '2026-09-10T10:00:00Z', is_zero_fir: false, action_taken: 'registered', sexual_offence: false, contents_original: 'Fictional complaint text', sections: [{ act: 'BNS', section: '318' }] }
const routes: Record<string, unknown> = {
  '/api/firs?limit=51&offset=0': [fir],
  '/api/firs/f1': fir,
  '/api/firs/f1/people': [{ id: 'p1', role: 'victim', label: 'V1', display_name: 'Victim 1', age_years: 30, identity_masked: true }],
  '/api/firs/f1/deadlines': [{ kind: 'chargesheet_60', due_on: '2026-11-10', basis: 'BNSS 187(3)' }],
  '/api/firs/f1/readiness': { playbook: null, charges: [], gaps: [], openGaps: 0 },
  '/api/playbooks': [],
  '/api/firs/f1/evidence': [{ id: 'e1', label: 'Bank statement', kind: 'electronic', sha256: null, court_ready: false }],
}
function mockApi() {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/login') {
      const b = JSON.parse(init!.body as string)
      return b.password === 'fictional-pass-1'
        ? { ok: true, status: 200, json: async () => ({ token: 'tok-new', user: { ...io.user, full_name: 'SI New Login' } }) }
        : { ok: false, status: 401, json: async () => ({ error: 'Wrong username or password.' }) }
    }
    const body = routes[url]
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
beforeEach(() => setSession(io))
afterEach(() => { cleanup(); window.location.hash = ''; vi.unstubAllGlobals(); setSession(null) })

test('lists FIRs with a link to the detail page', async () => {
  mockApi()
  render(<App />)
  expect((await screen.findByRole('link', { name: '7/2026' })).getAttribute('href')).toBe('#/firs/f1')
})

test('detail shows people with protected identity, deadlines and evidence', async () => {
  mockApi()
  window.location.hash = '#/firs/f1'
  render(<App />)
  expect(await screen.findByText(/identity protected/)).toBeTruthy()
  expect(await screen.findByText(/BNSS 187\(3\)/)).toBeTruthy()
  expect(await screen.findByText(/not court-ready yet/)).toBeTruthy()
})

test('detail withholds the complaint text when the API says so', async () => {
  routes['/api/firs/f1'] = { ...fir, contents_original: null, contents_withheld: true }
  mockApi()
  window.location.hash = '#/firs/f1'
  render(<App />)
  expect(await screen.findByText(/Complaint text withheld/)).toBeTruthy()
  expect(screen.queryByText('Fictional complaint text')).toBeNull()
  routes['/api/firs/f1'] = fir
})

test('language tool page converts a whole pasted text', async () => {
  mockApi()
  window.location.hash = '#/type'
  render(<App />)
  fireEvent.change(screen.getByLabelText('Typing language'), { target: { value: 'mr' } })
  fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'police station, Pune.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Convert all English-letter words' }))
  expect((screen.getByLabelText('Text') as HTMLTextAreaElement).value).toBe('पोलीस स्टेशन, पुणे.')
})

test('shows an error when the server fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
  render(<App />)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('500'))
})

test('without a session only the sign-in form shows; a wrong password says so; a good one opens the FIR list', async () => {
  setSession(null)
  const fetch = mockApi()
  render(<App />)
  expect(screen.queryByRole('navigation')).toBeNull()
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'si.fictional' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Wrong username or password.')
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-pass-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('link', { name: '7/2026' })).toBeTruthy()
  expect(screen.getByText(/SI New Login/)).toBeTruthy()
  const firCall = fetch.mock.calls.find(([url]) => url === '/api/firs?limit=51&offset=0')!
  expect((firCall[1] as RequestInit).headers).toEqual({ authorization: 'Bearer tok-new' })
  expect(screen.queryByRole('link', { name: 'AI settings' })).toBeNull() // only the state admin sees it
})

test('a 401 ends the session and shows the sign-in form; sign out does too', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  setSession(io)
  mockApi()
  cleanup()
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
})

test('the Policies link opens the policies page for any signed-in user', async () => {
  mockApi()
  Object.assign(routes, { '/api/policies': [], '/api/policy-settings': [], '/api/stations': [], '/api/state-packs': [] })
  window.location.hash = '#/policies'
  render(<App />)
  expect(screen.getByRole('link', { name: 'Policies' }).getAttribute('href')).toBe('#/policies')
  expect(await screen.findByRole('heading', { name: 'Policies' })).toBeTruthy()
})

const admin: Session = { token: 'tok-admin', user: { id: 'u9', username: 'admin.fictional', full_name: 'Fictional Admin', rank: 'IG', role: 'state_admin', station_id: null, can_import: true, permissions: ['admin.manage', 'import.run'], case_scope: 'none' } }

test('the menu follows the account: station staff get the front desk, only the admin gets Admin and AI settings, import needs its permission', async () => {
  mockApi()
  const { unmount } = render(<App />)
  const nav = () => within(screen.getByRole('navigation', { name: 'Main' }))
  expect(nav().getByRole('link', { name: 'Front desk' })).toBeTruthy()
  expect(nav().queryByRole('link', { name: 'Admin' })).toBeNull()
  expect(nav().queryByRole('link', { name: 'Load data' })).toBeNull()
  unmount()
  setSession(admin)
  render(<App />)
  expect(nav().queryByRole('link', { name: 'Front desk' })).toBeNull()   // no station
  expect(nav().getByRole('link', { name: 'Admin' })).toBeTruthy()
  expect(nav().getByRole('link', { name: 'AI settings' })).toBeTruthy()
  expect(nav().getByRole('link', { name: 'Load data' })).toBeTruthy()
})

test('the Admin menu follows the permission admin.manage, not the role name', () => {
  mockApi()
  setSession({ ...admin, user: { ...admin.user, permissions: ['import.run'] } })
  const { unmount } = render(<App />)
  const nav = () => within(screen.getByRole('navigation', { name: 'Main' }))
  expect(nav().queryByRole('link', { name: 'Admin' })).toBeNull()
  unmount()
  setSession({ ...io, user: { ...io.user, role: 'state_security_cell', station_id: null, permissions: ['admin.manage'] } })
  render(<App />)
  expect(nav().getByRole('link', { name: 'Admin' })).toBeTruthy()
})

test.each(['#/front-desk', '#/policies', '#/password', '#/import', '#/admin', '#/settings', '#/complaints/c1'])('the page at %s opens and a sign-out leaves the login screen', async (hash) => {
  mockApi()
  setSession(admin)
  window.location.hash = hash
  render(<App />)
  await waitFor(() => expect(screen.getByRole('main').textContent).not.toBe(''))
  expect(screen.queryByLabelText('Username')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByLabelText('Username')).toBeTruthy()
})

test('the screen language is chosen in the header, kept on the server, and the menu follows it; a refusal is shown', async () => {
  const fetch = mockApi()
  routes['/api/me/language'] = null
  const { unmount } = render(<App />)
  const nav = () => within(screen.getByRole('navigation'))
  fireEvent.change(screen.getByLabelText('Screen language'), { target: { value: 'mr' } })
  expect(await nav().findByRole('link', { name: 'एफआयआर' })).toBeTruthy()
  expect(fetch).toHaveBeenCalledWith('/api/me/language', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ language: 'mr' }) }))
  expect(document.documentElement.lang).toBe('mr')
  expect(screen.getByRole('option', { name: /मराठी \(Marathi\) – भाषांतराचा मसुदा/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'साइन आउट' })).toBeTruthy()
  unmount()
  // the next sign-in starts in the kept language; a refused change leaves it and says why
  delete routes['/api/me/language']
  render(<App />)
  fireEvent.change(screen.getByLabelText('स्क्रीनची भाषा'), { target: { value: 'ta' } })
  expect((await screen.findByRole('alert')).textContent).toBe('सर्व्हरने 404 उत्तर दिले')   // the server's answer in the screen language
  expect(nav().getByRole('link', { name: 'एफआयआर' })).toBeTruthy()
})

test('before sign-in the chosen screen language is used on the sign-in page', () => {
  setSession(null)
  mockApi()
  render(<App />)
  fireEvent.change(screen.getByLabelText('Screen language'), { target: { value: 'hi' } })
  expect(screen.getByRole('heading', { name: 'साइन इन' })).toBeTruthy()
  expect(screen.getByLabelText('यूज़रनेम')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('यूज़रनेम'), { target: { value: 'si.fictional' } })
  fireEvent.change(screen.getByLabelText('पासवर्ड'), { target: { value: 'wrong-pass' } })
  fireEvent.click(screen.getByRole('button', { name: 'साइन इन करें' }))
  return screen.findByText('गलत यूज़रनेम या पासवर्ड।')
})
