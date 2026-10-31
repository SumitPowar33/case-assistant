// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Chargesheets from './Chargesheets'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

test('a chargesheet names the ticked accused; none ticked is refused before sending', async () => {
  const writes: { url: string; body: unknown }[] = []
  const lists: Record<string, unknown> = {
    '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional One' }, { id: 'p2', role: 'accused', label: 'A2', display_name: 'Fictional Two' },
      { id: 'p3', role: 'witness', label: 'W1', display_name: 'Fictional Witness' }],
    '/firs/f1/chargesheets': [{ id: 'c1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1' }],
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 201, json: async () => ({ id: 'c2' }) }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  const saved = vi.fn()
  render(<Chargesheets firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/CS-1: filed on 2026-10-20 in Fictional JMFC Court, naming A1/)).toBeTruthy()
  expect(screen.queryByLabelText(/W1/)).toBeNull()
  const form = screen.getByText('Record a chargesheet filed in court').closest('details')!
  fireEvent.change(within(form).getByLabelText('Filed on'), { target: { value: '2026-10-25' } })
  fireEvent.change(within(form).getByLabelText('Court'), { target: { value: 'Fictional JMFC Court' } })
  fireEvent.change(within(form).getByLabelText('Chargesheet number'), { target: { value: 'CS-2' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('Tick the accused this chargesheet names.')
  fireEvent.click(within(form).getByLabelText(/A2: Fictional Two/))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/chargesheets', body: { filedOn: '2026-10-25', court: 'Fictional JMFC Court', reportNo: 'CS-2', accusedIds: ['p2'] } }])
})

test('a correction starts from the recorded entry, keeps the named accused ticked and needs a reason', async () => {
  const writes: { url: string; body: unknown }[] = []
  const lists: Record<string, unknown> = {
    '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional One' }, { id: 'p2', role: 'accused', label: 'A2', display_name: 'Fictional Two' }],
    '/firs/f1/chargesheets': [
      { id: 'c0', filed_on: '2026-10-19', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1', correction_reason: null, replaced: true },
      { id: 'c1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1, A2', correction_reason: 'court name was typed wrongly', replaced: false },
    ],
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: 201, json: async () => ({ id: 'c2' }) }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  const saved = vi.fn()
  render(<Chargesheets firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/replaced by a later entry/)).toBeTruthy()
  expect(screen.getAllByText('Correct this chargesheet entry')).toHaveLength(1)   // only the current entry can be corrected
  const form = screen.getByText('Correct this chargesheet entry').closest('details')!
  expect((within(form).getByLabelText('Filed on') as HTMLInputElement).value).toBe('2026-10-20')
  expect((within(form).getByLabelText(/A2: Fictional Two/) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(within(form).getByLabelText(/A2: Fictional Two/))
  fireEvent.change(within(form).getByLabelText('Filed on'), { target: { value: '2026-10-21' } })
  fireEvent.change(within(form).getByLabelText(/Why this is being corrected/), { target: { value: 'A2 was named in error' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/chargesheets/c1/corrections', body: {
    filedOn: '2026-10-21', court: 'Fictional JMFC Court', reportNo: 'CS-1', accusedIds: ['p1'], reason: 'A2 was named in error' } }])
})

test('in Hindi the list, the replaced entry, the correction and both forms are in Hindi; numbers, courts and reasons stay', async () => {
  const lists: Record<string, unknown> = {
    '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional One' }],
    '/firs/f1/chargesheets': [
      { id: 'c0', filed_on: '2026-10-19', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1', correction_reason: null, replaced: true },
      { id: 'c1', filed_on: '2026-10-20', court: 'Fictional JMFC Court', report_no: 'CS-1', recorded_by_name: 'SI Fictional', accused: 'A1', correction_reason: 'court name was typed wrongly', replaced: false },
    ],
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] })))
  render(<ScreenLangContext.Provider value="hi"><Chargesheets firId="f1" version={0} onSaved={vi.fn()} /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'आरोप-पत्र' })).toBeTruthy()
  expect(screen.getByText('CS-1: 2026-10-19 को Fictional JMFC Court में दाखिल, नामित A1').tagName).toBe('DEL')
  const [old, current] = screen.getAllByRole('listitem')
  expect(old.textContent).toContain('(SI Fictional द्वारा दर्ज; बाद की प्रविष्टि से बदला गया)')
  expect(current.textContent).toContain('सुधार। कारण: court name was typed wrongly')
  expect(within(current).getByText('इस आरोप-पत्र प्रविष्टि में सुधार करें')).toBeTruthy()
  const form = screen.getByText('न्यायालय में दाखिल आरोप-पत्र दर्ज करें').closest('details')!
  expect(within(form).getByLabelText('आरोप-पत्र संख्या')).toBeTruthy()
  expect(form.textContent).toContain('गलती “इस आरोप-पत्र प्रविष्टि में सुधार करें” से सुधारें')
  fireEvent.change(within(form).getByLabelText('दाखिल करने की तारीख'), { target: { value: '2026-10-25' } })
  fireEvent.change(within(form).getByLabelText('न्यायालय'), { target: { value: 'Fictional JMFC Court' } })
  fireEvent.change(within(form).getByLabelText('आरोप-पत्र संख्या'), { target: { value: 'CS-2' } })
  fireEvent.click(within(form).getByRole('button', { name: 'सहेजें' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('इस आरोप-पत्र में नामित आरोपियों पर निशान लगाएँ।')
})

test('with no chargesheet yet the list says so', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
  render(<ScreenLangContext.Provider value="ta"><Chargesheets firId="f1" version={0} onSaved={vi.fn()} /></ScreenLangContext.Provider>)
  expect(await screen.findByText('இன்னும் எதுவும் தாக்கல் செய்யப்படவில்லை.')).toBeTruthy()
})
