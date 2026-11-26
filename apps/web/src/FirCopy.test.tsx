// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import FirCopy from './FirCopy'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const head = { fir_no: 5, fir_year: 2026, registered_at: '2026-10-01T10:00:00Z', information_received_at: '2026-10-01T09:00:00Z', gd_entry_no: 'GD-7', is_zero_fir: false,
  outside_limits_place: null, occurrence_known: true, occurrence_from: '2026-09-29T10:00:00Z', occurrence_to: '2026-09-29T11:00:00Z', occurrence_place: 'Fictional Market Road',
  contents_original: 'Fictional information as given', contents_language: 'mr', action_taken: 'investigate', action_reason: null, station: 'Fictional North PS',
  district: 'North', state: 'National', io_name: 'SI Fictional First', io_rank: 'SI', law: 'bnss', sections: 'BNS 318(4)', later_sections: 0 }
const informant = { label: 'C1', name: 'Fictional Complainant', parentage: 'S/o Fictional Parent', age_years: 52, gender: 'M', address: 'Fictional Lane', contact: '9000000001' }

function stub(body: object, status = 200) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return { ok: status < 300, status, json: async () => body } }))
  vi.stubGlobal('print', vi.fn())
  return urls
}
const show = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Show the FIR as paper' }))
  return screen.findByRole('article', { name: 'First information report, paper copy' })
}

test('nothing is read until asked; the paper holds the report as registered, the number at its head, and prints', async () => {
  const urls = stub({ withheld: false, head, complaint: null, informants: [informant, { ...informant, name: null, parentage: null, age_years: null, gender: null, address: null, contact: null }] })
  render(<FirCopy firId="f1" />)
  expect(urls).toEqual([])
  const paper = await show()
  expect(urls).toEqual(['/api/firs/f1/copy'])
  const text = paper.textContent!
  expect(paper.querySelector('thead')!.textContent).toBe('FIR 5/2026 · Fictional North PS')
  for (const part of ['First information report', 'Under section 173 of the Bharatiya Nagarik Suraksha Sanhita, 2023', 'District: North', 'Acts and sections: BNS 318(4)',
    'General diary entry: GD-7', 'Place of occurrence: Fictional Market Road', 'Fictional Complainant, S/o Fictional Parent, 52, M, Fictional Lane, 9000000001; name not known',
    'Action taken: Investigation taken up', 'Investigating officer: SI Fictional First (SI)', 'BNSS 173(2)', 'Signature or thumb impression of the informant',
    'The signed first information report is the record.']) expect(text).toContain(part)
  expect(within(paper).getByText('Fictional information as given').getAttribute('lang')).toBe('mr')
  expect(text).toMatch(/Date and time of the offence: 29 Sept? 2026.* – 29 Sept? 2026/)
  expect(text).not.toContain('added later')
  expect(screen.queryByRole('note')).toBeNull()
  expect(window.print).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Print the FIR copy' }))
  expect(window.print).toHaveBeenCalled()
})

test('a signed complaint, a zero FIR before July 2024, sections added later and no officer yet', async () => {
  stub({ withheld: false, informants: [], complaint: { mode: 'written', name: 'Fictional Informant', contact: '9000000002', signed_at: '2024-06-01T10:00:00Z', signed_recorded_by_name: 'HC Fictional Desk' },
    head: { ...head, law: 'crpc', is_zero_fir: true, outside_limits_place: 'Fictional Far Village', occurrence_place: null, occurrence_known: false, later_sections: 2, io_name: null, io_rank: null,
      district: null, sections: '', action_taken: 'refused', action_reason: 'Fictional reason' } })
  render(<FirCopy firId="f1" />)
  const text = (await show()).textContent!
  for (const part of ['Under section 154 of the Code of Criminal Procedure, 1973', 'CrPC 154(2)', 'District: —', 'Acts and sections: — (sections added later, not listed here: 2)',
    'Date and time of the offence: not known', 'Place of occurrence: — · outside the limits of this police station: Fictional Far Village', 'FIR no.: 5 (Zero FIR)',
    'Fictional Informant, 9000000002 (Written and signed by the informant)', 'signature recorded by HC Fictional Desk', 'Fictional reason', 'Investigating officer: —']) expect(text).toContain(part)
})

test('on a withheld paper it says why and shows no name or text; a refusal shows the reason', async () => {
  stub({ withheld: true, complaint: null, informants: [], head: { ...head, contents_original: null, occurrence_place: null, occurrence_from: null, occurrence_to: null } })
  render(<FirCopy firId="f1" />)
  const paper = await show()
  expect(within(paper).getByRole('note').textContent).toContain('BNS 72, POCSO 23')
  expect(paper.textContent).toContain('Complainant or informant: —')
  expect(paper.textContent).toContain('Information, as given (language: MR): —')
  expect(paper.textContent).toContain('Date and time of the offence: not known')
  expect(paper.querySelector('blockquote')).toBeNull()
  cleanup()
  stub({ error: 'Not found' }, 404)
  render(<FirCopy firId="f1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Show the FIR as paper' }))
  expect((await screen.findByRole('alert')).textContent).toBeTruthy()
  expect(screen.queryByRole('article')).toBeNull()
})
