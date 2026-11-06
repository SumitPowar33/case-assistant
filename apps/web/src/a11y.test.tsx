// @vitest-environment jsdom
// Accessibility check of the main screens with axe-core (test-only dependency, decided 31 Oct 2026). jsdom draws no
// pixels, so colour contrast is not checked here; everything axe can judge from the markup is (labels, roles, names).
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import LoginPage from './LoginPage'
import FirList from './FirList'
import FirDetail from './FirDetail'
import { ComplaintPage, FrontDeskPage } from './FrontDesk'
import TypePage from './TypePage'
import ReadsPage from './ReadsPage'
import Supervisor from './Supervisor'
import MoneyTrail from './MoneyTrail'
import Property from './Property'
import ExpertRequests from './ExpertRequests'
import Court from './Court'
import LawFinder from './LawFinder'
import AskCaseFile from './AskCaseFile'
import { setSession } from './api'

// Fictional data only.
const data: Record<string, unknown> = {
  '/firs': [{ id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', action_taken: 'investigate', io_name: 'SI Fictional', station_name: 'Fictional PS' }],
  '/firs/f1': { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', is_zero_fir: false, contents_original: 'Fictional words', contents_withheld: false, action_taken: 'investigate', io_name: 'SI Fictional', sections: [{ act: 'BNS', section: '318(4)' }] },
  '/firs/f1/money-trail': { evidence: [{ id: 'e1', label: '214/E-01' }], transfers: [{ id: 't1', from_account: 'Fictional A/c XXXX1', to_account: 'Fictional A/c XXXX2', amount_paise: 100000, transferred_on: '2026-08-19', evidence_label: null, to_person: 'A1' }], holds: [], accused: [{ person_id: 'a1', label: 'A1', name: 'Fictional Caller', received_paise: 100000, account_holder: true, second_links: 0, status: 'money_only' }], transferred_paise: 100000, held_paise: 0 },
  '/firs/f1/deadlines': [{ kind: 'victim_progress_update', due_on: '2026-12-30', basis: 'BNSS 193(3)(ii), 90 days' }],
  '/expert-requests': { requests: [{ id: 'r1', fir_id: 'f1', fir_no: 9, fir_year: 2026, kind: 'forensic', subject: 'Phone extraction 9', sent_to: 'Fictional Lab', sent_on: '2026-10-01', station: 'Fictional PS', status: 'sent', note: null, days_waiting: 35, reminder_due: true }], counts: { open: 1, reminder_due: 1, report_received: 0 } },
  '/court': { cases: [{ fir_id: 'f1', fir_no: 9, fir_year: 2026, station: 'Fictional PS', court: 'Fictional Court 4', case_no: 'CC 9/2026', next_date: '2026-12-18', events: 1, summons_open: 1 }], counts: { coming: 1, no_date: 0 } },
  '/firs/f1/court': { events: [{ id: 'e1', kind: 'charge_framing', on_date: '2026-12-18', court: 'Fictional Court 4', case_no: 'CC 9/2026', note: null }], summons: [{ id: 's1', witness: 'Fictional Witness A', role: null, status: 'sent', on_date: '2026-11-20', note: null }] },
  '/firs/f1/expert-requests/r1/steps': [{ id: 's1', status: 'sent', on_date: '2026-10-01', note: null }],
  '/property': { items: [{ id: 'i1', fir_id: 'f1', fir_no: 9, fir_year: 2026, label: '9/P-01', description: 'Fictional knife', station: 'Fictional PS', moved_at: '2026-10-03T11:00:00Z', location: 'Fictional malkhana', place: 'malkhana', seal_intact: true, status: 'in_malkhana' }], counts: { in_malkhana: 1, out: 0, released: 0 }, truncated: false },
  '/firs/f1/evidence/i1/custody': [{ at: '2026-10-03T11:00:00Z', handed_by: 'SI Fictional', received_by: 'HC Fictional', location: 'Fictional malkhana', purpose: 'deposit', seal_intact: true, place: 'malkhana' }],
  '/supervisor': { waiting_approval: 1, due_in_21_days: 1, cases: [{ id: 'f1', fir_no: 9, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional', io_rank: 'SI', deadline_kind: 'chargesheet_custody', due_on: '2026-11-11', days_left: 7, open_gaps: 2, report_status: 'submitted', can_decide: true }] },
  '/complaint-kinds': [{ id: 'other', label: 'Other information', steps: [] }],
  '/complaints/c1': { id: 'c1', received_at: '2026-10-30T04:30:00Z', mode: 'written', informant_name: 'Fictional Informant', informant_contact: null, kind: 'other', kind_label: 'Other information',
    withheld: false, text_original: 'Fictional words.', text_language: 'en', recorded_by_name: 'HC Fictional', read_back_language: null, signed_at: null, signed_by_name: null,
    outcome: null, outcome_reason: null, fir_id: null, fir_no: null, fir_year: null, sign_by: null, enquiry_due: null, steps: [] },
  '/stations': [{ id: 's1', district: 'Fictional District', name: 'Fictional PS' }],
  '/protected-reads': [{ id: 'r1', at: '2026-11-01T04:30:00Z', what: 'people', fir_id: 'f1', fir_ref: '2026/9', complaint_id: null, reader_name: 'SI Fictional', reader_rank: 'SI', reader_username: 'si.fictional' }],
  '/law-finder': { status: 'draft', note: '', entries: [{ law: 'IPC', newLaw: 'BNS', from: '302', to: '103', what: 'Murder: punishment', partial: false }, { law: 'IEA', newLaw: 'BSA', from: '65B', to: '63', what: 'Electronic records', partial: true }] },
  '/glossary': { status: 'draft', entries: [{ id: 'remand', term: 'Remand', law: 'BNSS 187', meaning: 'Custody ordered by a Magistrate.', terms: { hi: 'रिमांड' } }] },
}
beforeEach(() => {
  setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => data[url.replace('/api', '').replace(/\?.*$/, '')] ?? [] })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

test.each([
  ['sign-in', () => <LoginPage />, 'Sign in'],
  ['FIR list', () => <FirList />, '9/2026'],
  ['FIR screen', () => <FirDetail id="f1" />, 'Deadlines'],
  ['front desk', () => <FrontDeskPage />, 'Take a complaint'],
  ['complaint', () => <ComplaintPage id="c1" />, 'Fictional words.'],
  ['language tool and glossary', () => <TypePage />, 'BNSS 187'],
  ['protected reads', () => <ReadsPage />, 'People of the case'],
  ['supervisor review', () => <Supervisor />, 'Open cases by nearest deadline'],
  ['money trail', () => <MoneyTrail firId="f1" />, 'Record a transfer'],
  ['case property', () => <Property />, '9/P-01'],
  ['forensic and medical requests', () => <ExpertRequests />, 'Phone extraction 9'],
  ['court and trial tracker', () => <Court />, 'CC 9/2026'],
  ['old law to new law finder', () => <LawFinder />, 'IPC 302'],
  ['ask the case file', () => <AskCaseFile firId="f1" />, 'Your question'],
])('the %s screen has no accessibility faults axe can see', async (_name, screenOf, ready) => {
  render(screenOf())
  await screen.findAllByText(new RegExp(ready.replace(/[()/.]/g, '\\$&')))
  expect(await violations()).toEqual([])
})

test('the case property screen with an item picked (its hand-over log and form) has no accessibility faults either', async () => {
  render(<Property />)
  fireEvent.click(await screen.findByRole('button', { name: '9/P-01' }))
  await screen.findByRole('heading', { name: 'Record a hand-over' })
  expect(await violations()).toEqual([])
})

test('the forensic and medical screen with a request picked (its steps and form) has no accessibility faults either', async () => {
  render(<ExpertRequests />)
  fireEvent.click(await screen.findByRole('button', { name: 'Phone extraction 9' }))
  await screen.findByRole('heading', { name: 'Record the next step' })
  expect(await violations()).toEqual([])
})

test('the court screen with a case picked (its timeline, summons and forms) has no accessibility faults either', async () => {
  render(<Court />)
  fireEvent.click(await screen.findByRole('button', { name: 'FIR 9/2026' }))
  await screen.findByRole('heading', { name: 'Add a court date' })
  expect(await violations()).toEqual([])
})
