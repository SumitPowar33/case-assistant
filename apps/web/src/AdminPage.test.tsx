// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import AdminPage from './AdminPage'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'a1', username: 'admin.one', full_name: 'State Admin', rank: 'Admin', role: 'state_admin', station_id: null } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const accounts = [
  { id: 'a1', username: 'admin.one', full_name: 'State Admin', rank: 'Admin', role: 'state_admin', station_id: null, station_name: null, district: null, active: true, locked_until: null },
  { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1', station_name: 'Demo Cyber PS', district: 'Demo District', active: true, locked_until: '2026-10-25T16:00:00Z' },
  { id: 'u2', username: 'hc.away', full_name: 'HC Away', rank: 'HC', role: 'front_desk', station_id: 's1', station_name: 'Demo Cyber PS', district: 'Demo District', active: false, locked_until: null },
]
const lists: Record<string, unknown> = {
  '/users': accounts,
  '/stations': [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS', cctns_code: null }],
  '/state-packs': [{ code: 'IN', name: 'National', status: 'draft' }],
  '/admin-actions': [{ action: 'user_disabled', reason: 'Fictional transfer out', at: '2026-10-25T10:00:00Z', actor_name: 'State Admin', username: 'hc.away', user_name: 'HC Away', station_name: null }],
  '/roles': [{ code: 'io', label: 'Investigating officer', station_required: true, permissions: ['case.write'] }, { code: 'sho', label: 'Station House Officer', station_required: true, permissions: [] }, { code: 'state_admin', label: 'State admin', station_required: false, permissions: [] }],
  '/sign-ins': [{ username_tried: 'si.fictional', outcome: 'wrong_password', client_ip: '127.0.0.1', at: '2026-10-25T15:45:00Z' }],
}

function stub(write: { status: number; body: unknown } = { status: 204, body: null }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '').replace(/\?.*/, '')] ?? [] }
  }))
  return writes
}
const type = (label: string | RegExp, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } })

test('accounts show their state; locked ones can be unlocked and disabled ones enabled, each with a reason', async () => {
  const writes = stub()
  render(<AdminPage />)
  const row = (await screen.findByText('SI Fictional (SI)')).closest('tr')!
  expect(within(row).getByText('Locked until 25 Oct 2026, 9:30 pm IST')).toBeTruthy()
  expect(within(screen.getByText('HC Away (HC)').closest('tr')!).getByText('Disabled')).toBeTruthy()
  expect(screen.queryByText('Enable', { selector: 'summary' })).toBeTruthy()
  type('Reason to unlock SI Fictional', 'Officer called from the station')
  fireEvent.click(screen.getByRole('button', { name: 'Unlock SI Fictional' }))
  expect((await screen.findByRole('status')).textContent).toBe('SI Fictional is unlocked.')
  expect(writes).toEqual([{ url: '/api/users/u1/unlock', body: { reason: 'Officer called from the station' } }])
  expect(screen.getByText(/Account disabled: HC Away \(hc.away\) by State Admin. Reason: “Fictional transfer out”/)).toBeTruthy()
  expect(screen.getByText('wrong password')).toBeTruthy()
})

test('a station role needs a station and both passwords must match before anything is sent', async () => {
  const writes = stub({ status: 201, body: { id: 'u9' } })
  render(<AdminPage />)
  const form = (await screen.findByText('Add an account')).closest('details')!
  type('Full name', 'PSI Demo', within(form))
  type('Rank', 'PSI', within(form))
  type(/^Username/, 'psi.demo', within(form))
  type(/^First password \(/, 'fictional-pass-123', within(form))
  type('First password again', 'fictional-pass-124', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The two passwords are not the same.')
  type('First password again', 'fictional-pass-123', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Choose the police station for this role.')
  expect(writes).toHaveLength(0)
  type(/^Police station/, 's1', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/users', body: { username: 'psi.demo', password: 'fictional-pass-123', fullName: 'PSI Demo', rank: 'PSI', role: 'io', stationId: 's1' } })
})

test('your own account cannot be disabled from here; a server refusal is shown', async () => {
  stub({ status: 409, body: { message: 'This account is already disabled.' } })
  render(<AdminPage />)
  const own = (await screen.findByText('State Admin (Admin)')).closest('tr')!
  expect(within(own).queryByText('Disable', { selector: 'summary' })).toBeNull()
  expect(within(own).getByText('you')).toBeTruthy()
  type('Reason to disable SI Fictional', 'Testing a refusal here')
  fireEvent.click(screen.getByRole('button', { name: 'Disable SI Fictional' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This account is already disabled.')
})

test('a transfer changes role, rank or station with a reason and warns about FIRs the officer is still IO of', async () => {
  const writes = stub({ status: 200, body: { changed: 'role io to sho; rank SI to PI', firsAsIo: 2 } })
  render(<AdminPage />)
  const row = (await screen.findByText('SI Fictional (SI)')).closest('tr')!
  expect(within(screen.getByText('State Admin (Admin)').closest('tr')!).queryByText('Change', { selector: 'summary' })).toBeNull()
  fireEvent.change(within(row).getByLabelText('New role for SI Fictional'), { target: { value: 'sho' } })
  type('Rank', 'PI', within(row))
  type(/^Reason \(for example/, 'Fictional transfer order 12', within(row))
  fireEvent.click(within(row).getByRole('button', { name: 'Change SI Fictional' }))
  expect((await screen.findByRole('status')).textContent).toBe(
    'SI Fictional: role io to sho; rank SI to PI. They must sign in again. They are still the IO of 2 FIRs; give those cases to another officer.')
  expect(writes).toEqual([{ url: '/api/users/u1', body: { role: 'sho', rank: 'PI', stationId: 's1', reason: 'Fictional transfer order 12' } }])
})

test('the role list from the packs is shown read-only', async () => {
  stub()
  render(<AdminPage />)
  const row = (await screen.findByText('Investigating officer', { selector: 'th' })).closest('tr')!
  expect(within(row).getByText('case.write')).toBeTruthy()
  expect(within(screen.getByText('State admin', { selector: 'th' }).closest('tr')!).getByText('—')).toBeTruthy()
})

// Regression (31 Oct 2026): the form dropped the chosen station for a state admin, so a new or promoted state admin
// had no station and the server took them for the platform admin of every state.
test('a state admin keeps the chosen station (their state), when created and when promoted', async () => {
  const writes = stub({ status: 201, body: { id: 'u9', changed: 'role io to state_admin', firsAsIo: 0 } })
  render(<AdminPage />)
  const form = (await screen.findByText('Add an account')).closest('details')!
  type('Full name', 'Admin Demo', within(form))
  type('Rank', 'SP', within(form))
  fireEvent.change(within(form).getByLabelText('Role'), { target: { value: 'state_admin' } })
  type(/^Police station/, 's1', within(form))
  type(/^Username/, 'admin.demo', within(form))
  type(/^First password \(/, 'fictional-pass-123', within(form))
  type('First password again', 'fictional-pass-123', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body).toMatchObject({ role: 'state_admin', stationId: 's1' })
  const row = screen.getByText('SI Fictional (SI)').closest('tr')!
  fireEvent.change(within(row).getByLabelText('New role for SI Fictional'), { target: { value: 'state_admin' } })
  type(/^Reason \(for example/, 'Fictional posting order 7', within(row))
  fireEvent.click(within(row).getByRole('button', { name: 'Change SI Fictional' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1].body).toMatchObject({ role: 'state_admin', stationId: 's1' })
})

test('role names and the station rule come from the packs, so a role a state adds can be given', async () => {
  lists['/roles'] = [...(lists['/roles'] as object[]), { code: 'duty_officer', label: 'Station duty officer', station_required: true, permissions: [] }]
  const writes = stub({ status: 201, body: { id: 'u9' } })
  render(<AdminPage />)
  const form = (await screen.findByText('Add an account')).closest('details')!
  await within(form).findByRole('option', { name: 'Station duty officer' })
  expect(within(screen.getByText('SI Fictional (SI)').closest('tr')!).getByText('Investigating officer', { selector: 'td' })).toBeTruthy()
  type('Full name', 'HC Duty', within(form))
  type('Rank', 'HC', within(form))
  fireEvent.change(within(form).getByLabelText('Role'), { target: { value: 'duty_officer' } })
  type(/^Username/, 'hc.duty', within(form))
  type(/^First password \(/, 'fictional-pass-123', within(form))
  type('First password again', 'fictional-pass-123', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Create account' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Choose the police station for this role.')
  expect(writes).toHaveLength(0)
  ;(lists['/roles'] as object[]).pop()
})

test('in Marathi: accounts, the reason forms, the logs and the role list; names, role labels from the packs and server texts stay as sent', async () => {
  lists['/admin-actions'] = [
    { action: 'user_disabled', reason: 'Fictional transfer out', at: '2026-10-25T10:00:00Z', actor_name: 'State Admin', username: 'hc.away', user_name: 'HC Away', station_name: null, detail: null },
    { action: 'station_moved', reason: null, at: '2026-10-25T11:00:00Z', actor_name: 'State Admin', username: null, user_name: null, station_name: 'Demo Cyber PS', detail: 'fictional' },
  ]
  lists['/sign-ins'] = [{ username_tried: 'si.fictional', outcome: 'wrong_password', client_ip: null, at: '2026-10-25T15:45:00Z' },
    { username_tried: 'x.y', outcome: 'captcha_failed', client_ip: '127.0.0.1', at: '2026-10-25T15:46:00Z' }]
  const writes = stub()
  render(<ScreenLangContext.Provider value="mr"><AdminPage /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'राज्य ॲडमिन' })).toBeTruthy()
  for (const name of ['खाती', 'पोलीस ठाणी', 'साइन-इन लॉग', 'ॲडमिन लॉग', 'भूमिका आणि परवानग्या']) expect(screen.getByRole('heading', { name })).toBeTruthy()
  const row = screen.getByText('SI Fictional (SI)').closest('tr')!
  expect(within(row).getByText(/^25 Oct 2026, 9:30 pm IST पर्यंत लॉक$/)).toBeTruthy()
  expect(within(row).getByText('Investigating officer', { selector: 'td' })).toBeTruthy()
  expect(within(screen.getByText('HC Away (HC)').closest('tr')!).getByText('बंद')).toBeTruthy()
  expect(within(screen.getByText('State Admin (Admin)').closest('tr')!).getByText('तुम्ही')).toBeTruthy()
  type('SI Fictional अनलॉक करण्याचे कारण', 'Officer called from the station')
  fireEvent.click(screen.getByRole('button', { name: 'SI Fictional अनलॉक करा' }))
  expect((await screen.findByRole('status')).textContent).toBe('SI Fictional अनलॉक केले.')
  expect(writes).toEqual([{ url: '/api/users/u1/unlock', body: { reason: 'Officer called from the station' } }])
  expect(screen.getByText(/^.*: खाते बंद केले: HC Away \(hc.away\), State Admin यांनी\. कारण: “Fictional transfer out”$/)).toBeTruthy()
  expect(screen.getByText(/: station_moved: Demo Cyber PS \(fictional\), State Admin यांनी$/)).toBeTruthy()   // an action the screen does not know shows its code
  expect(screen.getByRole('cell', { name: 'चुकीचा पासवर्ड' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'captcha_failed' })).toBeTruthy()
  const roleRow = screen.getByText('Investigating officer', { selector: 'th' }).closest('tr')!
  expect(within(roleRow).getByText('होय')).toBeTruthy()
  expect(within(screen.getByText('State admin', { selector: 'th' }).closest('tr')!).getByText('नाही')).toBeTruthy()
  const add = screen.getByText('खाते जोडा').closest('details')!
  expect(within(add).getByRole('button', { name: 'खाते तयार करा' })).toBeTruthy()
  type('पूर्ण नाव', 'PSI Demo', within(add))
  type('हुद्दा', 'PSI', within(add))
  type(/^यूजरनेम/, 'psi.demo', within(add))
  type(/^पहिला पासवर्ड \(/, 'fictional-pass-123', within(add))
  type('पहिला पासवर्ड पुन्हा', 'fictional-pass-124', within(add))
  fireEvent.click(within(add).getByRole('button', { name: 'खाते तयार करा' }))
  expect((await screen.findByRole('alert')).textContent).toBe('दोन्ही पासवर्ड सारखे नाहीत.')
  type('पहिला पासवर्ड पुन्हा', 'fictional-pass-123', within(add))
  fireEvent.click(within(add).getByRole('button', { name: 'खाते तयार करा' }))
  expect((await screen.findByRole('alert')).textContent).toBe('या भूमिकेसाठी पोलीस ठाणे निवडा.')
  expect(writes.length).toBe(1)
  const station = screen.getByText('पोलीस ठाणे जोडा').closest('details')!
  expect(within(station).getByRole('button', { name: 'ठाणे जोडा' })).toBeTruthy()
})

test('in Hindi: a transfer of the IO of one FIR, enabling an account and an installation without state packs', async () => {
  lists['/state-packs'] = []
  const writes = stub({ status: 200, body: { changed: 'rank SI to PI', firsAsIo: 1 } })
  render(<ScreenLangContext.Provider value="hi"><AdminPage /></ScreenLangContext.Provider>)
  const row = (await screen.findByText('SI Fictional (SI)')).closest('tr')!
  type('पद', 'PI', within(row))
  type(/^कारण \(जैसे तबादला आदेश\)/, 'Fictional transfer order 12', within(row))
  fireEvent.click(within(row).getByRole('button', { name: 'SI Fictional को बदलें' }))
  expect((await screen.findByRole('status')).textContent).toBe(
    'SI Fictional: rank SI to PI। उन्हें फिर से साइन इन करना होगा। वे अभी भी 1 एफआईआर के IO हैं; ये मामले किसी दूसरे अधिकारी को दें।')
  type('HC Away को सक्रिय करने का कारण', 'Back from fictional leave')
  fireEvent.click(screen.getByRole('button', { name: 'HC Away को सक्रिय करें' }))
  expect(await screen.findByText('HC Away सक्रिय किए गए और उन्हें फिर से साइन इन करना होगा।')).toBeTruthy()
  expect(writes.map((w) => w.url)).toEqual(['/api/users/u1', '/api/users/u2/enable'])
  expect(screen.getByText('अभी कोई राज्य पैक लोड नहीं है, इसलिए कोई थाना नहीं जोड़ा जा सकता।')).toBeTruthy()
  lists['/state-packs'] = [{ code: 'IN', name: 'National', status: 'draft' }]
})

test('a police station is added to a loaded state pack; an empty CCTNS code is sent as none', async () => {
  const writes = stub({ status: 201, body: { id: 's9' } })
  render(<AdminPage />)
  const form = (await screen.findByText('Add a police station')).closest('details')!
  type('District', 'Demo District', within(form))
  type('Station name', 'Demo Harbour PS', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Add station' }))
  expect((await screen.findByRole('status')).textContent).toBe('Station added.')
  expect(writes).toEqual([{ url: '/api/stations', body: { stateCode: 'IN', district: 'Demo District', name: 'Demo Harbour PS', cctnsCode: null } }])
})
