// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import IoAssignment from './IoAssignment'
import { ScreenLangContext } from './i18n'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })
// the form follows the role's case scope from the packs; the role name is never looked at
const as = (role: string, case_scope: 'none' | 'station' | 'district') =>
  setSession({ token: 't', user: { id: 'u1', username: 'x.fictional', full_name: 'Fictional', rank: 'PI', role, station_id: 's1', case_scope, permissions: [] } })

function stub(lists: Record<string, unknown>) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 204, json: async () => null }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  return writes
}
const lists = {
  '/firs/f1/io-candidates': [{ id: 'i1', full_name: 'SI Fictional One', rank: 'SI', role: 'io' }, { id: 'i2', full_name: 'SI Fictional Two', rank: 'SI', role: 'io' }],
  '/firs/f1/io-history': [{ at: '2026-10-01T05:00:00Z', from_name: null, to_name: 'SI Fictional One', assigned_by_name: 'PI Fictional SHO', reason: null }],
}

test('the SHO changes the IO only with a reason; the history is shown', async () => {
  as('sho', 'station')
  const writes = stub(lists)
  const saved = vi.fn()
  render(<IoAssignment firId="f1" ioName="SI Fictional One" version={0} onSaved={saved} />)
  expect(screen.getByText('Investigating officer: SI Fictional One')).toBeTruthy()
  expect(await screen.findByText(/SI Fictional One assigned by PI Fictional SHO/)).toBeTruthy()
  fireEvent.change(await screen.findByLabelText('Officer'), { target: { value: 'i2' } })
  fireEvent.change(screen.getByLabelText('Reason for the change'), { target: { value: 'Fictional leave of IO' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/io', body: { ioId: 'i2', reason: 'Fictional leave of IO' } }])
})

test('an FIR without an IO says so; an IO does not get the assign form', async () => {
  as('io', 'none')
  stub(lists)
  render(<IoAssignment firId="f1" ioName={null} version={0} onSaved={() => {}} />)
  expect(screen.getByText('not assigned yet')).toBeTruthy()
  await screen.findByText('IO history')
  expect(screen.queryByText('Assign the IO')).toBeNull()
})

test('the first IO needs no reason; a change with a short reason is refused before anything is sent', async () => {
  as('sp', 'district')
  const writes = stub({ ...lists, '/firs/f1/io-history': [{ at: '2026-10-02T05:00:00Z', from_name: 'SI Fictional One', to_name: 'SI Fictional Two', assigned_by_name: 'PI Fictional SHO', reason: 'Fictional transfer' }] })
  const saved = vi.fn()
  const { unmount } = render(<IoAssignment firId="f1" ioName={null} version={0} onSaved={saved} />)
  fireEvent.change(await screen.findByLabelText('Officer'), { target: { value: 'i1' } })
  expect(screen.queryByLabelText('Reason for the change')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/io', body: { ioId: 'i1', reason: null } }])
  expect(await screen.findByText(/SI Fictional One to SI Fictional Two by PI Fictional SHO. Reason: “Fictional transfer”/)).toBeTruthy()
  unmount()

  const again = stub(lists)
  render(<IoAssignment firId="f1" ioName="SI Fictional One" version={0} onSaved={saved} />)
  fireEvent.change(await screen.findByLabelText('Reason for the change'), { target: { value: 'short' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
  expect(await screen.findByText('Give the reason for changing the IO (at least 10 characters).')).toBeTruthy()
  expect(again).toEqual([])
})

test('a failure to load the officers is shown instead of the form', async () => {
  as('sho', 'station')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('io-candidates')
    ? { ok: false, status: 500, json: async () => null } : { ok: true, status: 200, json: async () => [] })))
  render(<IoAssignment firId="f1" ioName="SI Fictional One" version={0} onSaved={() => {}} />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
})

test('a role a state adds with a station scope may assign; the role name alone gives nothing', async () => {
  stub(lists)
  as('duty_officer', 'station')
  const { unmount } = render(<IoAssignment firId="f1" ioName={null} version={0} onSaved={() => {}} />)
  expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy()
  unmount()
  as('sho', 'none')
  render(<IoAssignment firId="f1" ioName={null} version={0} onSaved={() => {}} />)
  await screen.findByText('IO history')
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
})

test('in Hindi the IO line, the form and the history are in Hindi; a change with its reason reads in order', async () => {
  as('sho', 'station')
  stub({ ...lists, '/firs/f1/io-history': [...lists['/firs/f1/io-history'],
    { at: '2026-10-05T05:00:00Z', from_name: 'SI Fictional One', to_name: 'SI Fictional Two', assigned_by_name: 'PI Fictional SHO', reason: 'Fictional transfer reason' }] })
  render(<ScreenLangContext.Provider value="hi"><IoAssignment firId="f1" ioName="SI Fictional Two" version={0} onSaved={() => {}} /></ScreenLangContext.Provider>)
  expect(screen.getByText('जाँच अधिकारी: SI Fictional Two')).toBeTruthy()
  expect(await screen.findByText('मामला दूसरे जाँच अधिकारी को दें')).toBeTruthy()
  expect(screen.getByText(/: SI Fictional One नियुक्त, PI Fictional SHO द्वारा$/)).toBeTruthy()
  expect(screen.getByText(/: SI Fictional One से SI Fictional Two, PI Fictional SHO द्वारा\. कारण: “Fictional transfer reason”$/)).toBeTruthy()
})
