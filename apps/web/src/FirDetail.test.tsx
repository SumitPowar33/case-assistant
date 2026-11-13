// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ScreenLangContext } from './i18n'
import FirDetail from './FirDetail'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const fir = { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T05:00:00Z', is_zero_fir: false, contents_original: 'Fictional complaint words',
  contents_withheld: false, action_taken: 'investigate', io_name: 'SI Fictional One', sections: [{ act: 'BNS', section: '318(4)' }], case_team: true }

function stub(over: Record<string, unknown>, failing: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace('/api', '')
    if (failing.includes(path)) return { ok: false, status: 500, json: async () => null }
    return { ok: true, status: 200, json: async () => (path in over ? over[path] : path === '/firs/f1' ? fir : path === '/firs/f1/sections' ? { law: 'new', sections: [], charges: [] } : path === '/firs/f1/readiness' ? { gaps: [], issues: [] } : path === '/firs/f1/punishment-hint' ? { suggested: null, unknown: [], sections: [] } : path === '/firs/f1/statements' ? { witnesses: [], statements: [] } : path === "/firs/f1/money-trail" ? { evidence: [], transfers: [], holds: [], accused: [], transferred_paise: 0, held_paise: 0 } : path === "/firs/f1/final-report" ? { draft: null, events: [], readinessChecked: false, openGaps: 0, canApprove: false, particulars: { sections: '', accused: 0, witnesses: 0, statements_from: 0, evidence_items: 0 } } : path === '/firs/f1/diary' ? { date: '2026-11-02', today: true, page: null, entries: [], events: [], days: [] } : []) }
  }))
}

test('a full case page: sections, people, deadlines and electronic evidence with its court-ready state', async () => {
  stub({
    '/firs/f1/people': [{ id: 'p1', role: 'victim', label: 'V1', display_name: 'Victim V1', age_years: 17, identity_masked: true },
      { id: 'p2', role: 'accused', label: 'A1', display_name: 'Fictional Accused', age_years: null, identity_masked: false }],
    '/firs/f1/deadlines': [{ kind: 'chargesheet_custody', due_on: '2026-11-30', basis: 'BNSS 187(3)' },
      { kind: 'notice_reply:Fictional Bank Ltd', due_on: '2026-11-10', basis: 'BNSS_94' },
      { kind: 'a_kind_added_later', due_on: '2026-12-01', basis: 'BNSS 1' }],
    '/firs/f1/evidence': [{ id: 'e1', label: 'Phone', kind: 'electronic', sha256: null, court_ready: false },
      { id: 'e2', label: 'Laptop', kind: 'electronic', sha256: 'a'.repeat(64), court_ready: true },
      { id: 'e3', label: 'Knife', kind: 'physical', sha256: null, court_ready: false }],
  })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText('FIR 9/2026')).toBeTruthy()
  expect(screen.getByText('Sections: BNS 318(4)')).toBeTruthy()
  expect(screen.getByText('Fictional complaint words')).toBeTruthy()
  expect(await screen.findByText(/V1 \(victim\), 17: Victim V1 \(identity protected\)/)).toBeTruthy()
  expect(screen.getByText(/A1 \(accused\): Fictional Accused/)).toBeTruthy()
  expect(await screen.findByText(/Chargesheet for an accused in custody: by 2026-11-30/)).toBeTruthy()
  expect(screen.getByText(/Reply to the notice from Fictional Bank Ltd: by 2026-11-10/)).toBeTruthy()
  expect(screen.getByText(/a_kind_added_later: by 2026-12-01/)).toBeTruthy()   // a code no catalog knows shows as it is
  const chip = (text: RegExp) => screen.getByText(text).closest('.chip')!
  expect((await screen.findByText(/not court-ready yet/)).className).toContain('c-warn')
  expect(chip(/^court-ready$/).className).toContain('c-ok')
  expect(screen.getByText('Phone', { selector: 'strong' }).closest('li')!.className).toContain('card')
  expect(screen.getByText('aaaa…aaaa').getAttribute('title')).toBe('a'.repeat(64))   // a stored hash is shown short, whole on hover
  expect(screen.getByText('Knife', { selector: 'strong' }).closest('li')!.textContent).toBe('Knife (physical)')   // no chip, no hash for a physical item
})

test('a zero FIR with no sections, and a protected case that withholds the complaint text', async () => {
  stub({ '/firs/f1': { ...fir, is_zero_fir: true, sections: [], contents_original: null, contents_withheld: true } })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText('FIR 9/2026 (Zero FIR)')).toBeTruthy()
  expect(screen.getByText('Sections: none')).toBeTruthy()
  expect(screen.getByText(/Complaint text withheld/)).toBeTruthy()
  expect(screen.queryByText('Fictional complaint words')).toBeNull()
})

test('an FIR that cannot be loaded shows the error, and a section that cannot be loaded shows its own', async () => {
  stub({}, ['/firs/f1'])
  const { unmount } = render(<FirDetail id="f1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('500')
  unmount()
  stub({}, ['/firs/f1/deadlines'])
  render(<FirDetail id="f1" />)
  expect((await screen.findAllByRole('alert')).some((a) => a.textContent?.includes('/firs/f1/deadlines'))).toBe(true)
})

test('in Marathi the case page shows its headings, roles, deadlines and evidence state in Marathi; names and section numbers stay', async () => {
  stub({
    '/firs/f1': { ...fir, is_zero_fir: true },
    '/firs/f1/people': [{ id: 'p1', role: 'victim', label: 'V1', display_name: 'Victim V1', age_years: null, identity_masked: true }],
    '/firs/f1/deadlines': [{ kind: 'victim_progress_update', due_on: '2026-12-30', basis: 'BNSS 193(3)(ii), 90 days' }],
    '/firs/f1/evidence': [{ id: 'e1', label: 'Phone', kind: 'electronic', sha256: null, court_ready: false }],
  })
  render(<ScreenLangContext.Provider value="mr"><FirDetail id="f1" /></ScreenLangContext.Provider>)
  expect(await screen.findByText('एफआयआर 9/2026 (झिरो एफआयआर)')).toBeTruthy()
  expect(screen.getByText('← सर्व एफआयआर')).toBeTruthy()
  expect(screen.getByText('कलमे: BNS 318(4)')).toBeTruthy()
  expect(screen.getByText(/· तपास हाती घेतला$/)).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'व्यक्ती' })).toBeTruthy()
  expect(await screen.findByText('V1 (पीडित): Victim V1 (ओळख संरक्षित)')).toBeTruthy()
  expect(await screen.findByText(/पीडितेला प्रगतीची माहिती: 2026-12-30 पर्यंत/)).toBeTruthy()
  expect(await screen.findByText(/अजून न्यायालयासाठी तयार नाही/)).toBeTruthy()
})

test('on a phone one part of the FIR shows at a time: the picker lists every part and marks only the chosen one as shown', async () => {
  stub({ '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional Accused', age_years: null, identity_masked: false }] })
  render(<FirDetail id="f1" />)
  const picker = await screen.findByRole('combobox', { name: 'Show' })
  expect([...(picker as HTMLSelectElement).options].map((o) => o.text)).toEqual(
    ['Case details', 'People', 'Arrests', 'Chargesheets', 'Closure report', 'Deadlines', 'Evidence', 'Search and seizure', 'Notices', 'Readiness check', 'Statements', 'Money trail', 'Call records', 'Final report', 'Case diary', 'Ask the case file'])
  const partOf = (el: HTMLElement) => el.closest('.fir-part')!
  const people = await screen.findByText(/A1 \(accused\): Fictional Accused/)
  expect(partOf(screen.getByText('Fictional complaint words')).classList.contains('shown')).toBe(true)
  expect(partOf(people).classList.contains('shown')).toBe(false)   // still in the page (a desktop shows it), hidden on a phone
  fireEvent.change(picker, { target: { value: 'people' } })
  expect(partOf(people).classList.contains('shown')).toBe(true)
  expect(partOf(screen.getByText('Fictional complaint words')).classList.contains('shown')).toBe(false)
  expect(document.querySelectorAll('.fir-part.shown')).toHaveLength(1)
  expect(document.querySelectorAll('.fir-part')).toHaveLength(16)
})

test('the part picker is in the screen language', async () => {
  stub({})
  render(<ScreenLangContext.Provider value="mr"><FirDetail id="f1" /></ScreenLangContext.Provider>)
  const picker = await screen.findByRole('combobox', { name: 'दाखवा' })
  expect((picker as HTMLSelectElement).options[0].text).toBe('प्रकरणाचा तपशील')
})

test('the people are read once for the whole page, and a failed read shows in the people part and keeps the arrest form away', async () => {
  stub({ '/firs/f1/people': [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional Accused', age_years: null, identity_masked: false }] })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText(/A1 \(accused\): Fictional Accused/)).toBeTruthy()
  expect(await screen.findByText(/Add an arrest|Record an arrest/)).toBeTruthy()
  const reads = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter((c) => c[0] === '/api/firs/f1/people')
  expect(reads).toHaveLength(1)
  cleanup()
  stub({}, ['/firs/f1/people'])
  render(<FirDetail id="f1" />)
  expect((await screen.findAllByRole('alert'))[0].textContent).toMatch(/500/)
  expect(screen.queryByText(/Record an arrest/)).toBeNull()
})

test('the Ask part loads the case file only when it is chosen (opening a FIR must not read it, a protected case logs each read)', async () => {
  stub({ '/firs/f1/case-file': { passages: [] } })
  render(<FirDetail id="f1" />)
  const picker = await screen.findByRole('combobox', { name: 'Show' })
  const asked = () => (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0])
  expect(asked()).not.toContain('/api/firs/f1/case-file')
  expect(screen.queryByLabelText(/Your question/)).toBeNull()
  fireEvent.change(picker, { target: { value: 'ask' } })
  expect(await screen.findByLabelText(/Your question/)).toBeTruthy()
  expect(asked()).toContain('/api/firs/f1/case-file')
})

test('the AI fact check and section suggestion are on the case details part for the case team only, and no AI draft is offered on a protected case', async () => {
  const sections = { '/firs/f1/sections': { law: 'new', sections: [], charges: [] } }
  stub({ ...sections, '/firs/f1': { ...fir, case_team: false, victim_protected: false } })
  render(<FirDetail id="f1" />)
  expect(await screen.findByText('Fictional complaint words')).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'AI fact check' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'AI section suggestion' })).toBeNull()
  cleanup()
  stub({ ...sections, '/firs/f1': { ...fir, case_team: true, victim_protected: false } })
  render(<FirDetail id="f1" />)
  expect(await screen.findByRole('heading', { name: 'AI fact check' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Find facts with AI' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Suggest sections with AI' })).toBeTruthy()
  cleanup()
  stub({ ...sections, '/firs/f1': { ...fir, case_team: true, victim_protected: true } })
  render(<FirDetail id="f1" />)
  await screen.findByText(/The offence is from 1 July 2024/)
  // the fact check, the section suggestion and the final report's AI draft (A6) each say so
  expect(screen.getAllByText(/not offered on a case that protects the victim's identity/)).toHaveLength(3)
  expect(screen.getByText(/The AI draft is not offered/)).toBeTruthy()
})

test('on a phone the FIR opens on Deadlines; a wide screen opens on Case details', async () => {
  const mm = (matches: boolean) => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (q: string) => ({ matches: matches && q.includes('40rem') }) })
  mm(true)
  stub({})
  const { unmount } = render(<FirDetail id="f1" />)
  const picker = await screen.findByRole('combobox', { name: 'Show' })
  expect((picker as HTMLSelectElement).value).toBe('deadlines')
  unmount()
  mm(false)
  render(<FirDetail id="f1" />)
  expect(((await screen.findByRole('combobox', { name: 'Show' })) as HTMLSelectElement).value).toBe('case')
  delete (window as unknown as { matchMedia?: unknown }).matchMedia
})

test('a part named in the address wins over the phone default', async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: true }) })
  stub({})
  render(<FirDetail id="f1" only="people" />)
  expect(((await screen.findByRole('combobox', { name: 'Show' })) as HTMLSelectElement).value).toBe('people')
  delete (window as unknown as { matchMedia?: unknown }).matchMedia
})

test('someone outside the case team sees the case details and, on every other part, that only the case team sees it; tabs name every part', async () => {
  stub({ '/firs/f1': { ...fir, case_team: false, victim_protected: false } })
  render(<FirDetail id="f1" only="people" />)
  expect(await screen.findByText('Fictional complaint words')).toBeTruthy()
  expect(screen.getAllByText('Only the case team sees this part of the case.').length).toBe(15)
  expect(screen.queryByText(/The server answered/)).toBeNull()
  const tabs = screen.getByRole('navigation', { name: 'This case' })
  expect(within(tabs).getAllByRole('link')).toHaveLength(16)
  expect(within(tabs).getByRole('link', { name: 'People' }).getAttribute('aria-current')).toBe('page')
  expect(within(tabs).getByRole('link', { name: 'Call records' }).getAttribute('href')).toBe('#/firs/f1/cdr')
})
