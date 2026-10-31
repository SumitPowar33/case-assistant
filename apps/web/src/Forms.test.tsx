// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AddEvidenceForm, AddPersonForm, NewFirForm } from './Forms'
import { istIso, parseSections } from './formats'
import { setSession } from './api'

const io = { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1', permissions: ['fir.register', 'case.lead'], case_scope: 'none' as const }
beforeEach(() => setSession({ token: 't', user: io }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null); window.location.hash = '' })

function stub(status = 201, body: unknown = { id: 'new1' }) {
  const calls: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body && JSON.parse(init.body as string) })
    return { ok: status < 300, status, json: async () => body }
  }))
  return calls
}
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

test('sections are read from plain text, with the act names the server knows', () => {
  expect(parseSections('BNS 318(4), it act 66D; POCSO Act s. 4')).toEqual([
    { act: 'BNS', section: '318(4)' }, { act: 'IT Act', section: '66D' }, { act: 'POCSO Act', section: '4' }])
  expect(parseSections('  ')).toEqual([])
  expect(() => parseSections('BNS 318(4), Cheating 420')).toThrow('Not understood: "Cheating 420"')
  expect(() => parseSections('BNS')).toThrow()
})

test('times typed in the form are India time', () => {
  expect(istIso('2026-10-01T09:30')).toBe('2026-10-01T09:30:00+05:30')
  expect(() => istIso('')).toThrow('Give the date and time.')
})

test('registering an FIR sends the station, India times and sections, then opens it', async () => {
  const calls = stub()
  render(<NewFirForm />)
  type('FIR number', '41'); type('General diary entry', 'GD-3')
  type(/Information received/, '2026-10-01T09:00'); type(/^Registered/, '2026-10-01T10:00')
  type("Information as given (in the informant's words)", 'Fictional caller posed as a bank officer')
  type('Sections', 'BNS 318(4), BNS 319(2)')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(window.location.hash).toBe('#/firs/new1'))
  expect(calls[0]).toMatchObject({ url: '/api/firs', body: { stationId: 's1', ioId: 'u1', firNo: 41, gdEntryNo: 'GD-3', contentsLanguage: 'en',
    informationReceivedAt: '2026-10-01T09:00:00+05:30', registeredAt: '2026-10-01T10:00:00+05:30', actionTaken: 'investigate',
    sections: [{ act: 'BNS', section: '318(4)' }, { act: 'BNS', section: '319(2)' }] } })
})

test('"I am the IO" follows the permission case.lead: ticked for an officer of their own cases, offered unticked to a supervisor, absent without it', () => {
  const box = () => screen.queryByLabelText<HTMLInputElement>('I am the investigating officer')
  const { unmount } = render(<NewFirForm />)
  expect(box()!.checked).toBe(true)
  unmount()
  setSession({ token: 't', user: { ...io, role: 'sho', permissions: ['fir.register', 'case.lead'], case_scope: 'station' } })
  const second = render(<NewFirForm />)
  expect(box()!.checked).toBe(false)
  second.unmount()
  setSession({ token: 't', user: { ...io, role: 'io', permissions: ['fir.register'], case_scope: 'none' } })
  render(<NewFirForm />)
  expect(box()).toBeNull()
})

test('a bad section is shown and nothing is sent', async () => {
  const calls = stub()
  render(<NewFirForm />)
  type('FIR number', '41'); type('General diary entry', 'GD-3')
  type(/Information received/, '2026-10-01T09:00'); type(/^Registered/, '2026-10-01T10:00')
  type("Information as given (in the informant's words)", 'Fictional text')
  type('Sections', 'Section 420')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Not understood: "Section 420"/)
  expect(calls).toHaveLength(0)
})

test('only station staff see the FIR form', () => {
  setSession({ token: 't', user: { id: 'u2', username: 'state.admin', full_name: 'Admin', rank: 'Admin', role: 'state_admin', station_id: null } })
  render(<NewFirForm />)
  expect(screen.getByText('Only police station staff can register an FIR.')).toBeTruthy()
})

test('a person is added; an unknown name is sent as identity not known', async () => {
  const calls = stub()
  const saved = vi.fn()
  render(<AddPersonForm firId="f1" onSaved={saved} />)
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'accused' } })
  type('Label', 'A3')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(calls[0]).toMatchObject({ url: '/api/firs/f1/people', body: { role: 'accused', label: 'A3', identityKnown: false, fullName: null } })
})

test('electronic evidence needs its SHA-256; the server refusal is shown', async () => {
  const calls = stub(403, { message: 'Only the case team can do this.' })
  render(<AddEvidenceForm firId="f1" onSaved={() => {}} />)
  type('Label', 'E-02'); type('Description', 'Fictional phone'); type(/Seized/, '2026-10-02T10:00'); type('Seizure memo number', 'SM-2')
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'electronic' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/needs the 64-character SHA-256/)
  expect(calls).toHaveLength(0)
  type(/SHA-256/, 'A'.repeat(64))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Only the case team can do this.'))
  expect(calls[0].body).toMatchObject({ kind: 'electronic', sha256: 'A'.repeat(64), seizedAt: '2026-10-02T10:00:00+05:30' })
})

test('dates are shown in India time', async () => {
  const { fmt } = await import('./formats')
  expect(fmt('2026-10-01T04:30:00Z')).toMatch(/10:00\s?am IST$/i)
})
