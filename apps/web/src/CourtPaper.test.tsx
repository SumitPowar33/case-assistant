// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import CourtPaper from './CourtPaper'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const head = { fir_no: 3, fir_year: 2026, registered_at: '2026-11-13T05:30:00Z', station: 'Fictional Demo PS', district: 'Demo District', state: 'National', io_name: 'SI Fictional',
  io_rank: 'SI', sections: 'BNS 318(4), IT Act 66D', status: 'signed', facts_text: 'Fictional facts in brief.', evidence_text: 'Fictional evidence.', approved_by: 'PI Fictional Head',
  approved_rank: 'PI', signed_by: 'SI Fictional', signed_rank: 'SI', signed_at: '2026-11-13T07:30:00Z', report_no: 'CS-03/2026', court: 'Fictional JMFC Court', filed_on: '2026-11-13' }
const person = (o: object) => ({ role: 'witness', label: 'W1', masked: false, name: 'Fictional Witness', parentage: null, age_years: 40, gender: 'M', address: 'Fictional Road',
  arrested_at: null, first_remand_on: null, released_on: null, sent_up: false, has_statement: true, ...o })

function stub(body: object) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => body })))
  vi.stubGlobal('print', vi.fn())
}

test('the paper is filled from the file in the court form, a protected victim only by label, and goes to the printer', async () => {
  stub({ head, property: [{ label: 'E4', kind: 'physical', description: 'Fictional handset', seized_at: '2026-11-13T07:15:00Z', seal_no: 'SEAL-04', sha256: null }], people: [
    person({ role: 'accused', label: 'A1', name: 'Fictional Caller', parentage: 'S/o Fictional Father', arrested_at: '2026-11-13T07:10:00Z', sent_up: true, has_statement: false }),
    person({ role: 'accused', label: 'A2', name: 'Fictional Absconder', sent_up: false, has_statement: false }),
    person({ role: 'victim', label: 'V1', masked: true, name: null, address: null }),
    person({}),
  ] })
  render(<CourtPaper firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Print for the court' }))
  const paper = await screen.findByRole('article', { name: 'Final report (charge-sheet)' })
  expect(within(paper).getByText('In the court of Fictional JMFC Court')).toBeTruthy()
  expect(within(paper).getByText(/District: Demo District · Police station: Fictional Demo PS · Year: 2026 · FIR no.: 3/)).toBeTruthy()
  expect(within(paper).getByText(/Final report no.: CS-03\/2026/)).toBeTruthy()
  expect(within(paper).getByText('S/o Fictional Father')).toBeTruthy()
  expect(within(paper).getByText(/arrested .*; in custody/)).toBeTruthy()
  expect(within(paper).getByText(/Accused not sent up for trial: A2 Fictional Absconder/)).toBeTruthy()
  expect(within(paper).getAllByText('V1 (identity protected, BNS 72)').length).toBeGreaterThan(0)
  expect(within(paper).getByText('SEAL-04')).toBeTruthy()
  expect(within(paper).queryByText('DRAFT · NOT SIGNED')).toBeNull()
  await vi.waitFor(() => expect(window.print).toHaveBeenCalled())
})

test('an unsigned report prints as a draft', async () => {
  stub({ head: { ...head, status: 'approved', signed_by: null }, people: [], property: [] })
  render(<CourtPaper firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Print for the court' }))
  expect(await screen.findByText('DRAFT · NOT SIGNED')).toBeTruthy()
})

test('what is not recorded shows as a dash or "name not known", a victim who informed is the informant, custody reads as it stands', async () => {
  stub({
    head: { ...head, approved_by: 'PI Fictional Head', approved_rank: null, signed_rank: null, signed_at: null, court: null, district: '' },
    property: [{ label: 'E5', kind: 'electronic', description: 'Fictional file', seized_at: '2026-11-13T07:15:00Z', seal_no: null, sha256: 'abc123' }],
    people: [
      person({ role: 'accused', label: null, masked: true, name: null, parentage: null, age_years: null, gender: null, address: null, sent_up: true }),
      person({ role: 'accused', label: 'A2', name: 'Fictional Bailed', arrested_at: '2026-11-13T07:10:00Z', released_on: '2026-11-14', sent_up: true }),
      person({ role: 'suspect', label: 'S1', name: null }),
      person({ role: 'victim', label: 'V1', name: null, parentage: 'D/o Fictional Mother', has_statement: false }),
      person({ label: null, name: 'Fictional Bystander' }),
    ] })
  render(<CourtPaper firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Print for the court' }))
  const paper = await screen.findByRole('article', { name: 'Final report (charge-sheet)' })
  expect(within(paper).getByText('In the court of —')).toBeTruthy()
  expect(within(paper).getByText(/District: — · Police station/)).toBeTruthy()
  expect(within(paper).getByText('Fictional file (SHA-256 abc123)')).toBeTruthy()
  expect(within(paper).getByText('(identity protected, BNS 72)', { exact: false, selector: 'td' })).toBeTruthy()
  expect(within(paper).getByText('not arrested')).toBeTruthy()
  expect(within(paper).getByText(/^arrested .*; released 2026-11-14$/)).toBeTruthy()
  expect(within(paper).getByText(/Accused not sent up for trial: S1 name not known/)).toBeTruthy()
  expect(within(paper).getByText(/name not known, D\/o Fictional Mother/)).toBeTruthy()
  expect(within(paper).getByText('Fictional Bystander')).toBeTruthy()
  expect(within(paper).getByText(/PI Fictional Head \(—\)/)).toBeTruthy()
  expect(within(paper).getByText(/SI Fictional \(—\)$/)).toBeTruthy()
})

test('with no one recorded the lists show a dash, and a refused request shows why instead of a paper', async () => {
  stub({ head: { ...head, approved_by: null, signed_by: null, status: null }, people: [], property: [] })
  const view = render(<CourtPaper firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Print for the court' }))
  const paper = await screen.findByRole('article', { name: 'Final report (charge-sheet)' })
  expect(within(paper).getByText(/Complainant or informant: —/)).toBeTruthy()
  view.unmount()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Not your case (fictional refusal)' }) })))
  render(<CourtPaper firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Print for the court' }))
  expect((await screen.findByRole('alert')).textContent).toBeTruthy()
  expect(screen.queryByRole('article')).toBeNull()
})
