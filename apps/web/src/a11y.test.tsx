// @vitest-environment jsdom
// Accessibility check of the main screens with axe-core (test-only dependency, decided 31 Oct 2026). jsdom draws no
// pixels, so colour contrast is not checked here; everything axe can judge from the markup is (labels, roles, names).
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import LoginPage from './LoginPage'
import FirList from './FirList'
import FirDetail from './FirDetail'
import { ComplaintPage, FrontDeskPage } from './FrontDesk'
import TypePage from './TypePage'
import ReadsPage from './ReadsPage'
import Supervisor from './Supervisor'
import { setSession } from './api'

// Fictional data only.
const data: Record<string, unknown> = {
  '/firs': [{ id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', action_taken: 'investigate', io_name: 'SI Fictional', station_name: 'Fictional PS' }],
  '/firs/f1': { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T04:30:00Z', is_zero_fir: false, contents_original: 'Fictional words', contents_withheld: false, action_taken: 'investigate', io_name: 'SI Fictional', sections: [{ act: 'BNS', section: '318(4)' }] },
  '/firs/f1/deadlines': [{ kind: 'victim_progress_update', due_on: '2026-12-30', basis: 'BNSS 193(3)(ii), 90 days' }],
  '/supervisor': { waiting_approval: 1, due_in_21_days: 1, cases: [{ id: 'f1', fir_no: 9, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional', io_rank: 'SI', deadline_kind: 'chargesheet_custody', due_on: '2026-11-11', days_left: 7, open_gaps: 2, report_status: 'submitted', can_decide: true }] },
  '/complaint-kinds': [{ id: 'other', label: 'Other information', steps: [] }],
  '/complaints/c1': { id: 'c1', received_at: '2026-10-30T04:30:00Z', mode: 'written', informant_name: 'Fictional Informant', informant_contact: null, kind: 'other', kind_label: 'Other information',
    withheld: false, text_original: 'Fictional words.', text_language: 'en', recorded_by_name: 'HC Fictional', read_back_language: null, signed_at: null, signed_by_name: null,
    outcome: null, outcome_reason: null, fir_id: null, fir_no: null, fir_year: null, sign_by: null, enquiry_due: null, steps: [] },
  '/stations': [{ id: 's1', district: 'Fictional District', name: 'Fictional PS' }],
  '/protected-reads': [{ id: 'r1', at: '2026-11-01T04:30:00Z', what: 'people', fir_id: 'f1', fir_ref: '2026/9', complaint_id: null, reader_name: 'SI Fictional', reader_rank: 'SI', reader_username: 'si.fictional' }],
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
])('the %s screen has no accessibility faults axe can see', async (_name, screenOf, ready) => {
  render(screenOf())
  await screen.findAllByText(new RegExp(ready.replace(/[()/.]/g, '\\$&')))
  expect(await violations()).toEqual([])
})
