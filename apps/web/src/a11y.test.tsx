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
import AuditPage from './AuditPage'
import StatePage from './StatePage'
import ReadsPage from './ReadsPage'
import Supervisor from './Supervisor'
import MoneyTrail from './MoneyTrail'
import Property from './Property'
import ExpertRequests from './ExpertRequests'
import Court from './Court'
import LawFinder from './LawFinder'
import AskCaseFile from './AskCaseFile'
import Search from './Search'
import FactCheck from './FactCheck'
import Statements from './Statements'
import SectionSuggest from './SectionSuggest'
import ActingPage from './ActingPage'
import NarrativeDraft from './NarrativeDraft'
import VictimLetter from './VictimLetter'
import { setSession } from './api'

// Fictional data only.
const data: Record<string, unknown> = {
  '/firs': [{ id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', action_taken: 'investigate', io_name: 'SI Fictional', station_name: 'Fictional PS' }],
  '/firs/f1': { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', is_zero_fir: false, contents_original: 'Fictional words', contents_withheld: false, victim_protected: false, case_team: true, action_taken: 'investigate', io_name: 'SI Fictional', sections: [{ act: 'BNS', section: '318(4)' }] },
  '/firs/f1/money-trail': { evidence: [{ id: 'e1', label: '214/E-01' }], transfers: [{ id: 't1', from_account: 'Fictional A/c XXXX1', to_account: 'Fictional A/c XXXX2', amount_paise: 100000, transferred_on: '2026-08-19', evidence_label: null, to_person: 'A1' }], holds: [], accused: [{ person_id: 'a1', label: 'A1', name: 'Fictional Caller', received_paise: 100000, account_holder: true, second_links: 0, status: 'money_only' }], transferred_paise: 100000, held_paise: 0 },
  '/firs/f1/deadlines': [{ kind: 'victim_progress_update', due_on: '2026-12-30', basis: 'BNSS 193(3)(ii), 90 days' }],
  '/expert-requests': { requests: [{ id: 'r1', fir_id: 'f1', fir_no: 9, fir_year: 2026, kind: 'forensic', subject: 'Phone extraction 9', sent_to: 'Fictional Lab', sent_on: '2026-10-01', station: 'Fictional PS', status: 'sent', note: null, days_waiting: 35, reminder_due: true }], counts: { open: 1, reminder_due: 1, report_received: 0 } },
  '/court': { cases: [{ fir_id: 'f1', fir_no: 9, fir_year: 2026, station: 'Fictional PS', court: 'Fictional Court 4', case_no: 'CC 9/2026', next_date: '2026-12-18', events: 1, summons_open: 1 }], counts: { coming: 1, no_date: 0 } },
  '/firs/f1/court': { events: [{ id: 'e1', kind: 'charge_framing', on_date: '2026-12-18', court: 'Fictional Court 4', case_no: 'CC 9/2026', note: null }], summons: [{ id: 's1', witness: 'Fictional Witness A', role: null, status: 'sent', on_date: '2026-11-20', note: null }] },
  '/firs/f1/expert-requests/r1/steps': [{ id: 's1', status: 'sent', on_date: '2026-10-01', note: null }],
  '/property': { items: [{ id: 'i1', fir_id: 'f1', fir_no: 9, fir_year: 2026, label: '9/P-01', description: 'Fictional knife', station: 'Fictional PS', moved_at: '2026-10-03T11:00:00Z', location: 'Fictional malkhana', place: 'malkhana', seal_intact: true, status: 'in_malkhana' }], counts: { in_malkhana: 1, out: 0, released: 0 }, truncated: false },
  '/firs/f1/evidence/i1/custody': [{ at: '2026-10-03T11:00:00Z', handed_by: 'SI Fictional', received_by: 'HC Fictional', location: 'Fictional malkhana', purpose: 'deposit', seal_intact: true, place: 'malkhana' }],
  '/supervisor': { waiting_approval: 1, due_in_21_days: 1, cases: [{ id: 'f1', fir_no: 9, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional', io_rank: 'SI', deadline_kind: 'chargesheet_custody', due_on: '2026-11-11', days_left: 7, open_gaps: 2, report_status: 'submitted', can_decide: true }], io_left: [{ id: 'f2', fir_no: 10, fir_year: 2026, io_name: 'SI Fictional Ravi', io_active: true, io_station_name: 'Fictional South PS' }] },
  '/complaint-kinds': [{ id: 'other', label: 'Other information', steps: [] }],
  '/complaints/c1': { id: 'c1', received_at: '2026-10-30T04:30:00Z', mode: 'written', informant_name: 'Fictional Informant', informant_contact: null, kind: 'other', kind_label: 'Other information',
    withheld: false, text_original: 'Fictional words.', text_language: 'en', recorded_by_name: 'HC Fictional', read_back_language: null, signed_at: null, signed_by_name: null,
    outcome: null, outcome_reason: null, fir_id: null, fir_no: null, fir_year: null, sign_by: null, enquiry_due: null, steps: [] },
  '/acting-charges/options': { officers: [{ id: 'o1', full_name: 'SI Fictional Asha', rank: 'SI', role: 'io' }], roles: [{ code: 'sho', label: 'Station House Officer' }] },
  '/acting-charges': [{ id: 'c1', full_name: 'SI Fictional Asha', rank: 'SI', role: 'sho', role_label: 'Station House Officer', reason: 'Fictional leave of the SHO', ends_at: '2026-11-20T18:29:59Z', status: 'running', ended_reason: null }],
  '/stations': [{ id: 's1', district: 'Fictional District', name: 'Fictional PS' }],
  '/pack-changes': { pack: { code: 'IN', name: 'Fictional National', version: '1', languages: ['en', 'hi'], status: 'draft' }, can_propose: true, changes: [
    { id: 'p1', title: 'Fictional playbook v1.5', body: 'Fictional text of the change.', tested_note: 'Fictional test', drafted_at: '2026-11-01T04:30:00Z', drafted_by_name: 'Fictional Officer', drafted_by_rank: 'SP',
      decision: null, decision_note: null, decided_at: null, decided_by_name: null, decided_by_rank: null, can_decide: true }] },
  '/audit-log': [{ kind: 'admin_action', at: '2026-11-01T04:30:00Z', who_name: 'Fictional Admin', who_rank: 'SP', what: 'user_disabled', reason: 'Fictional reason given', fir_id: null, fir_ref: null }],
  '/protected-reads': [{ id: 'r1', at: '2026-11-01T04:30:00Z', what: 'people', fir_id: 'f1', fir_ref: '2026/9', complaint_id: null, reader_name: 'SI Fictional', reader_rank: 'SI', reader_username: 'si.fictional' }],
  '/law-finder': { status: 'draft', note: '', entries: [{ law: 'IPC', newLaw: 'BNS', from: '302', to: '103', what: 'Murder: punishment', partial: false }, { law: 'IEA', newLaw: 'BSA', from: '65B', to: '63', what: 'Electronic records', partial: true }] },
  '/firs/f1/searches': [{ id: 'm1', place: 'Fictional house', grounds: 'Fictional grounds of the search', started_at: '2026-10-21T01:30:00Z', ended_at: '2026-10-21T02:10:00Z',
    no_witness_reason: null, recorded_by_name: 'SI Fictional', forwarded_on: null, forwarded_to: null, days_since: 2,
    witnesses: [{ name: 'Fictional Neighbour', address: 'Fictional lane' }], recordings: [{ sha256: 'ab'.repeat(32), seconds: 221, esakshya_id: null }],
    items: [{ id: 'e1', label: '9/E-03', description: 'Fictional phone', kind: 'physical', seal_no: '9/E-03' }] }],
  '/firs/f1/facts': [{ id: 'k1', kind: 'amount', value: 'Rs 40,000', ai_value: 'Rs 40,000', corrected: false, quote: 'Fictional words', confirmed_at: '2026-11-08T10:00:00Z', confirmed_by_name: 'SI Fictional' }],
  '/firs/f1/sections': { law: 'unknown', sections: [{ act: 'BNS', section: '318(4)', added_at: null, reason: null, chosen_by_name: null }, { act: 'IT Act', section: '66D', added_at: '2026-11-08T10:00:00Z', reason: 'Fictional reason given', chosen_by_name: 'SI Fictional' }],
    charges: [{ playbook_id: 'p', charge_id: 'c', act: 'BNS', law: 'BNS 319(2)', label: 'Fictional charge', ingredients: [{ id: 'i', text: 'Fictional ingredient' }, { id: 'j', text: 'Another ingredient' }], in_fir: false }] },
  '/ai/v1/generate': { request_id: 'r1', draft: '[{"kind":"place","value":"Fictional","quote":"Fictional"}]', provider: 'fake', model: 'm' },
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
  ['audit log', () => <AuditPage />, 'Admin change'],
  ['state setup', () => <StatePage />, 'Fictional playbook v1.5'],
  ['supervisor review', () => <Supervisor />, 'Open cases by nearest deadline'],
  ['money trail', () => <MoneyTrail firId="f1" />, 'Record a transfer'],
  ['case property', () => <Property />, '9/P-01'],
  ['forensic and medical requests', () => <ExpertRequests />, 'Phone extraction 9'],
  ['court and trial tracker', () => <Court />, 'CC 9/2026'],
  ['old law to new law finder', () => <LawFinder />, 'IPC 302'],
  ['ask the case file', () => <AskCaseFile firId="f1" />, 'Your question'],
  ['acting charge', () => <ActingPage />, 'Give acting charge'],
  ['search and seizure memo', () => <Search firId="f1" onSaved={() => {}} />, 'Fictional house'],
])('the %s screen has no accessibility faults axe can see', async (_name, screenOf, ready) => {
  render(screenOf())
  await screen.findAllByText(new RegExp(ready.replace(/[()/.]/g, '\\$&')))
  expect(await violations()).toEqual([])
})

test('the AI fact check with confirmed facts and an AI draft to check has no accessibility faults either', async () => {
  render(<FactCheck firId="f1" text="Fictional words" victimProtected={false} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find facts with AI' }))
  await screen.findByText('AI draft · check each fact')
  expect(await violations()).toEqual([])
})

test('the statements with a checked translation and an AI translation draft to check have no accessibility faults either', async () => {
  const base = { person_id: 'p1', label: 'W1', name: 'Fictional Son', masked: false, recorded_at: '2026-11-02T04:30:00Z', recorded_by_name: 'SI Fictional', language: 'mr', medium: 'video' }
  const list = { witnesses: [{ person_id: 'p1', role: 'witness', label: 'W1', name: 'Fictional Son', statements: 2 }], statements: [
    { ...base, id: 's1', original_text: 'बाबा व्हिडिओ कॉलवर होते.', translated_text: 'Father was on a video call.', translation_corrected: false, translation_checked_at: '2026-11-08T10:00:00Z', translation_checked_by_name: 'SI Fictional' },
    { ...base, id: 's2', original_text: 'मी २८ तारखेला पैसे पाठवले.', translated_text: null, translation_corrected: null, translation_checked_at: null, translation_checked_by_name: null }] }
  const answer = { request_id: 'r1', draft: 'I sent money on the 2nd.', provider: 'fake', model: 'm' }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.endsWith('generate') ? answer : list) })))
  render(<Statements firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Translate into English with AI' }))
  await screen.findByText('AI draft · read it against the original')
  await screen.findByText(/Numbers of the original not in the draft/)
  expect(await violations()).toEqual([])
})

test('the AI draft of the final report narrative with sentences to tick has no accessibility faults either', async () => {
  const answer = { request_id: 'r1', draft: '[{"part":"facts","text":"A caller rang.","source":"FIR","quote":"Fictional"},{"part":"evidence","text":"W1 saw it.","source":"S1","quote":"saw"}]', provider: 'fake', model: 'm' }
  const list = { witnesses: [], statements: [{ id: 's1', label: 'W1', name: null, masked: false, recorded_at: '2026-11-02T04:30:00Z', original_text: 'I saw it.', translated_text: null }] }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.endsWith('generate') ? answer : list) })))
  render(<NarrativeDraft firId="f1" text="Fictional words" victimProtected={false} sections="" language="en" written={{ facts: '', evidence: '' }} onTake={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Draft with AI from the file' }))
  await screen.findByText('AI draft · tick the sentences to take')
  expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  expect(await violations()).toEqual([])
})

test('the AI victim letter with a letter to use has no accessibility faults either', async () => {
  const answer = { request_id: 'r1', draft: 'FIR 9/2026 was registered. The inquiry continues.', provider: 'fake', model: 'm' }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => answer })))
  render(<VictimLetter firId="f1" firNo={9} firYear={2026} registeredAt="2026-11-02T04:30:00Z" />)
  expect(await violations()).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Draft the letter with AI' }))
  await screen.findByLabelText('Letter to the victim or informant')
  expect(await violations()).toEqual([])
})

test('the AI section suggestion with a suggestion to add has no accessibility faults either', async () => {
  const answer = { request_id: 'r1', draft: '[{"charge":"p/c","ingredients":[{"id":"i","quote":"Fictional"}]}]', provider: 'fake', model: 'm' }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.endsWith('generate') ? answer : data[url.replace('/api', '')]) })))
  render(<SectionSuggest firId="f1" text="Fictional words" victimProtected={false} version={0} onSaved={() => undefined} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest sections with AI' }))
  await screen.findByText('AI draft · you choose the sections')
  await screen.findByRole('button', { name: 'Add to the FIR' })
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
