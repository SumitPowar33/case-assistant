// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScreenLangContext } from './i18n'
import FirDetail from './FirDetail'
import { setSession } from './api'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const fir = { id: 'f1', fir_year: 2026, fir_no: 9, registered_at: '2026-10-01T05:00:00Z', is_zero_fir: false, contents_original: 'Fictional complaint words',
  contents_withheld: false, action_taken: 'investigate', io_name: 'SI Fictional One', sections: [{ act: 'BNS', section: '318(4)' }] }

function stub(over: Record<string, unknown>, failing: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.replace('/api', '')
    if (failing.includes(path)) return { ok: false, status: 500, json: async () => null }
    return { ok: true, status: 200, json: async () => (path in over ? over[path] : path === '/firs/f1' ? fir : path === '/firs/f1/readiness' ? { gaps: [], issues: [] } : path === '/firs/f1/punishment-hint' ? { suggested: null, unknown: [], sections: [] } : path === '/firs/f1/diary' ? { date: '2026-11-02', today: true, page: null, entries: [], events: [], days: [] } : []) }
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
  expect(screen.getByText(/A1 \(accused\): Fictional Accused$/)).toBeTruthy()
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
    ['Case details', 'People', 'Arrests', 'Chargesheets', 'Closure report', 'Deadlines', 'Evidence', 'Notices', 'Readiness check', 'Case diary'])
  const partOf = (el: HTMLElement) => el.closest('.fir-part')!
  const people = await screen.findByText(/A1 \(accused\): Fictional Accused/)
  expect(partOf(screen.getByText('Fictional complaint words')).classList.contains('shown')).toBe(true)
  expect(partOf(people).classList.contains('shown')).toBe(false)   // still in the page (a desktop shows it), hidden on a phone
  fireEvent.change(picker, { target: { value: 'people' } })
  expect(partOf(people).classList.contains('shown')).toBe(true)
  expect(partOf(screen.getByText('Fictional complaint words')).classList.contains('shown')).toBe(false)
  expect(document.querySelectorAll('.fir-part.shown')).toHaveLength(1)
  expect(document.querySelectorAll('.fir-part')).toHaveLength(10)
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
