// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Arrests from './Arrests'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(lists: Record<string, unknown>, write: { status: number; body: unknown } = { status: 201, body: { id: 'a9' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    const rows = lists[url.replace('/api', '')]
    if (!rows && url.endsWith('/punishment-hint')) return { ok: false, status: 404, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => rows ?? [] }
  }))
  return writes
}
const type = (label: string | RegExp, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } })

const people = [
  { id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional Accused' },
  { id: 'p2', role: 'witness', label: 'W1', display_name: 'Fictional Witness' },
]
const base = {
  person_label: 'A1', arrested_at: '2026-09-12T02:30:00Z', place: 'Testpur', grounds: ['to prevent further offence', 'proper investigation'],
  informed_name: 'Fictional Relative', informed_contact: null, arresting_officer_name: 'SI Fictional', max_punishment: 'less_than_10_years',
  remand_recorded_by_name: null,
}

test('an arrest shows its own chargesheet last day; one without a remand asks for it', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', earlier_custody_days: 5, remand_recorded_by_name: 'SI Fictional' },
    { ...base, id: 'a2', max_punishment: 'life', first_remand_on: null, chargesheet_last_day: null },
  ] }, { status: 204, body: null })
  const saved = vi.fn()
  render(<Arrests firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText('2026-11-10')).toBeTruthy()
  expect(screen.getByText(/chargesheet within 60 days/)).toBeTruthy()
  expect(screen.getByText(/5 days already spent in custody before an earlier release are counted/)).toBeTruthy()
  expect(screen.getAllByText(/arrested 12 Sept? 2026, 8:00 am IST at Testpur by SI Fictional/i)).toHaveLength(2)
  expect(screen.getByText(/First remand not recorded yet/)).toBeTruthy()
  const form = screen.getByText('Record the first remand').closest('details')!
  type(/Date of first remand/, '2026-09-13', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes[0]).toEqual({ url: '/api/firs/f1/arrests/a2/first-remand', body: { firstRemandOn: '2026-09-13' } })
})

test('the arrest form offers only accused, needs grounds and sends India time', async () => {
  const writes = stub({ '/firs/f1/people': people })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record an arrest (BNSS 35 memo)')).closest('details')!
  const options = within(form).getAllByRole('option').map((o) => o.textContent)
  expect(options).toContain('A1: Fictional Accused')
  expect(options.some((o) => o?.startsWith('W1'))).toBe(false)
  type(/^Arrested/, '2026-09-12T08:00', within(form)); type('Place of arrest', 'Testpur', within(form))
  type(/Relative or friend informed/, 'Fictional Relative', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  expect((await within(form).findByRole('alert')).textContent).toMatch(/grounds of arrest/)
  expect(writes).toHaveLength(0)
  type(/Grounds of arrest/, 'to prevent further offence\n\nproper investigation', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/arrests', body: {
    personId: 'p1', arrestedAt: '2026-09-12T08:00:00+05:30', place: 'Testpur', grounds: ['to prevent further offence', 'proper investigation'],
    informedName: 'Fictional Relative', informedContact: null, maxPunishment: 'less_than_10_years', firstRemandOn: null } })
})

test('the form suggests the punishment class from the sections and warns when the choice differs', async () => {
  stub({ '/firs/f1/people': people, '/firs/f1/punishment-hint': { suggested: 'death', sections: [{ section: 'BNS 103(1)', class: 'death' }], unknown: [] } })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record an arrest (BNSS 35 memo)')).closest('details')!
  expect((await within(form).findByRole('note')).textContent).toMatch(/BNS 103\(1\).*suggests death \(90 days\)/)
  expect(within(form).getByRole('alert').textContent).toMatch(/differs/)
  type('Highest punishment for the offences', 'death', within(form))
  expect(within(form).queryByRole('alert')).toBeNull()
})

test('with an unknown section there is no suggestion, only a note', async () => {
  stub({ '/firs/f1/people': people, '/firs/f1/punishment-hint': { suggested: null, sections: [], unknown: ['BNS 999(9)'] } })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  const form = (await screen.findByText('Record an arrest (BNSS 35 memo)')).closest('details')!
  expect((await within(form).findByRole('note')).textContent).toMatch(/No suggestion: BNS 999\(9\)/)
})

test('with no accused yet, the form is not shown', async () => {
  stub({ '/firs/f1/people': [people[1]] })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  expect(await screen.findByText(/only an accused can be arrested/)).toBeTruthy()
})

test('a release is recorded once; released and chargesheeted arrests say the limit has stopped', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', released_on: '2026-09-20', release_basis: 'bail', chargesheet_filed_on: null },
    { ...base, id: 'a2', person_label: 'A2', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', released_on: null, release_basis: null, chargesheet_filed_on: '2026-11-12' },
  ] }, { status: 204, body: null })
  render(<Arrests firId="f1" version={0} onSaved={() => {}} />)
  expect(await screen.findByText(/Released on bail on 2026-09-20: the custody limit no longer runs/)).toBeTruthy()
  expect(screen.getByText(/Chargesheet naming A2 filed on 2026-11-12, after the last day/)).toBeTruthy()
  const forms = screen.getAllByText('Record release from custody')
  expect(forms).toHaveLength(1)
  const form = forms[0].closest('details')!
  type('Released on', '2026-11-01', within(form))
  fireEvent.change(within(form).getByLabelText('How released'), { target: { value: 'default_bail' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/arrests/a2/release', body: { releasedOn: '2026-11-01', basis: 'default_bail' } })
})

test('a correction sends all four facts with a reason; it can say the person was not released', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', released_on: '2026-09-20', release_basis: 'bail', chargesheet_filed_on: null, corrected: false },
  ], '/firs/f1/arrests/corrections': [
    { id: 'c1', arrest_id: 'a1', first_remand_on: '2026-09-12', max_punishment: 'less_than_10_years', released_on: null, release_basis: null,
      reason: 'release was on the wrong arrest', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' },
  ] }, { status: 201, body: { id: 'c2' } })
  const saved = vi.fn()
  render(<Arrests firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/Reason: release was on the wrong arrest/)).toBeTruthy()
  const form = screen.getByText('Correct the remand, punishment or release').closest('details')!
  expect((within(form).getByLabelText(/Date of first remand/) as HTMLInputElement).value).toBe('2026-09-12')   // starts from what is recorded
  type(/Date of first remand/, '2026-09-13', within(form))
  type(/Released on/, '', within(form))
  fireEvent.change(within(form).getByLabelText(/Highest punishment/), { target: { value: 'life' } })
  type(/Why this is being corrected/, 'remand order shows the 13th', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/arrests/a1/corrections', body: {
    firstRemandOn: '2026-09-13', maxPunishment: 'life', releasedOn: null, releaseBasis: null, reason: 'remand order shows the 13th' } }])
})

test('a memo correction starts from the memo, sends place, grounds and informed person with a reason, and shows the history', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: null, chargesheet_last_day: null, released_on: null, release_basis: null, chargesheet_filed_on: null, corrected: false, memo_corrected: true },
  ], '/firs/f1/arrests/memo-corrections': [
    { id: 'm1', arrest_id: 'a1', place: 'Testpur Market', grounds: ['proper investigation'], informed_name: 'Fictional Friend', informed_contact: null,
      reason: 'place was the market', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' },
  ] })
  const saved = vi.fn()
  render(<Arrests firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/Reason: place was the market/)).toBeTruthy()
  const form = screen.getByText('Correct the place, grounds or informed person').closest('details')!
  expect((within(form).getByLabelText(/Place of arrest/) as HTMLInputElement).value).toBe('Testpur')   // starts from the memo
  type(/Place of arrest/, 'Testpur Bus Stand', within(form))
  type(/Why this is being corrected/, 'place was the bus stand', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/arrests/a1/memo-corrections', body: {
    place: 'Testpur Bus Stand', grounds: ['to prevent further offence', 'proper investigation'], informedName: 'Fictional Relative',
    informedContact: null, reason: 'place was the bus stand' } }])
})

test('a time correction sends the new time in IST with a reason and shows the history', async () => {
  const writes = stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: null, chargesheet_last_day: null, released_on: null, release_basis: null, chargesheet_filed_on: null, corrected: false, time_corrected: true },
  ], '/firs/f1/arrests/time-corrections': [
    { id: 't1', arrest_id: 'a1', arrested_at: '2026-09-11T16:30:00Z', reason: 'memo typed a day late', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' },
    { id: 't2', arrest_id: 'other', arrested_at: '2026-09-10T16:30:00Z', reason: 'belongs to another arrest', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' },
  ] }, { status: 201, body: { id: 't3' } })
  const saved = vi.fn()
  render(<Arrests firId="f1" version={0} onSaved={saved} />)
  expect(await screen.findByText(/Reason: memo typed a day late/)).toBeTruthy()
  expect(screen.queryByText(/belongs to another arrest/)).toBeNull()
  const form = screen.getByText('Correct the time of arrest').closest('details')!
  type(/Arrested \(date and time/, '2026-09-11T22:00', within(form))
  type(/Why this is being corrected/, 'memo typed a day late', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(saved).toHaveBeenCalled())
  expect(writes).toEqual([{ url: '/api/firs/f1/arrests/a1/time-corrections', body: { arrestedAt: '2026-09-11T22:00:00+05:30', reason: 'memo typed a day late' } }])
})

test('an imported arrest without an arresting officer says so', async () => {
  stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a3', place: 'Oldpur', arresting_officer_name: null, first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-12' },
  ] }, { status: 204, body: null })
  render(<Arrests firId="f1" version={0} onSaved={vi.fn()} />)
  expect(await screen.findByText(/at Oldpur, officer not in the old record/)).toBeTruthy()
})

test('in Marathi the arrests, their limits, corrections and the arrest form are in Marathi; names, places and reasons stay as written', async () => {
  stub({ '/firs/f1/people': people, '/firs/f1/punishment-hint': { suggested: 'death', sections: [{ section: 'BNS 103(1)', class: 'death' }], unknown: [] },
    '/firs/f1/arrests': [
      { ...base, id: 'a1', informed_contact: 'Testpur 1', first_remand_on: '2026-09-12', chargesheet_last_day: '2026-11-10', earlier_custody_days: 5,
        remand_recorded_by_name: 'SI Fictional', released_on: '2026-09-20', release_basis: 'default_bail', chargesheet_filed_on: null, corrected: false },
      { ...base, id: 'a2', person_label: 'A2', arresting_officer_name: null, max_punishment: 'a_new_class', first_remand_on: '2026-09-12',
        chargesheet_last_day: '2026-11-10', released_on: null, release_basis: null, chargesheet_filed_on: '2026-11-01', corrected: true },
    ],
    '/firs/f1/arrests/corrections': [{ id: 'c1', arrest_id: 'a1', first_remand_on: null, max_punishment: 'life', released_on: '2026-09-20', release_basis: 'bail',
      reason: 'remand order was misread', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' }],
    '/firs/f1/arrests/memo-corrections': [{ id: 'm1', arrest_id: 'a1', place: 'Testpur Market', grounds: ['proper investigation'], informed_name: 'Fictional Friend',
      informed_contact: null, reason: 'place was the market', recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' }],
    '/firs/f1/arrests/time-corrections': [{ id: 't1', arrest_id: 'a2', arrested_at: '2026-09-11T16:30:00Z', reason: 'memo typed a day late',
      recorded_at: '2026-10-01T05:00:00Z', recorded_by_name: 'SI Fictional' }],
  }, { status: 201, body: { id: 'a9' } })
  render(<ScreenLangContext.Provider value="mr"><Arrests firId="f1" version={0} onSaved={() => {}} /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'अटक' })).toBeTruthy()
  const [one, two] = screen.getAllByRole('listitem')
  expect(one.textContent).toMatch(/^A1: .+ रोजी Testpur येथे SI Fictional यांनी अटक केली/)
  expect(one.textContent).toContain('कळवले: Fictional Relative (Testpur 1)')
  expect(one.textContent).toContain('कमाल शिक्षा: 10 वर्षांपेक्षा कमी कारावास')
  expect(one.textContent).toContain('पहिली रिमांड 2026-09-12 (SI Fictional यांनी नोंदवली): दोषारोपपत्र 60 दिवसांत, शेवटचा दिवस 2026-11-10')
  expect(one.textContent).toContain('(BNSS 187(3); आधीच्या सुटकेपूर्वी कोठडीत घालवलेले 5 दिवस मोजले आहेत)')
  expect(one.textContent).toContain('2026-09-20 रोजी डिफॉल्ट जामिनावर (BNSS 187(3)) सुटका: कोठडीची मुदत आता चालत नाही.')
  expect(one.textContent).toMatch(/यांनी दुरुस्त केले: रिमांड नाही, जन्मठेप, 2026-09-20 रोजी सुटका\. कारण: remand order was misread/)
  expect(one.textContent).toMatch(/यांनी मेमो दुरुस्त केला: ठिकाण Testpur Market; कारणे proper investigation; कळवले Fictional Friend\. कारण: place was the market/)
  expect(two.textContent).toMatch(/A2: .* रोजी Testpur येथे अटक, जुन्या अभिलेखात अधिकारी नाही/)
  expect(two.textContent).toContain('कमाल शिक्षा: a_new_class')   // a class the screen does not know shows its code
  expect(two.textContent).toContain('A2 यांचे नाव असलेले दोषारोपपत्र 2026-11-01 रोजी दाखल.')
  expect(two.textContent).toMatch(/यांनी अटकेची वेळ दुरुस्त केली: .*\. कारण: memo typed a day late/)
  expect(within(one).queryByText('पहिली रिमांड नोंदवा')).toBeNull()   // remand and release already recorded
  expect(within(one).queryByText('कोठडीतून सुटका नोंदवा')).toBeNull()
  const fix = within(one).getByText('रिमांड, शिक्षा किंवा सुटका दुरुस्त करा').closest('details')!
  expect(within(fix).getByRole('option', { name: 'जन्मठेप (दोषारोपपत्रासाठी 90 दिवस)' })).toBeTruthy()
  expect(within(fix).getByRole('option', { name: 'जामिनावर' })).toBeTruthy()
  expect(within(fix).getByLabelText('दुरुस्ती का केली जात आहे')).toBeTruthy()
  const memo = within(one).getByText('ठिकाण, कारणे किंवा कळवलेली व्यक्ती दुरुस्त करा').closest('details')!
  expect(memo.textContent).toContain('वेळेसाठी “अटकेची वेळ दुरुस्त करा” वापरा.')
  const form = screen.getByText('अटक नोंदवा (BNSS 35 मेमो)').closest('details')!
  expect((await within(form).findByRole('note')).textContent).toMatch(/कलमांवरून \(BNS 103\(1\)\) तक्ता मृत्युदंड \(90 दिवस\) सुचवतो/)
  expect(within(form).getByRole('alert').textContent).toContain('तुम्ही 10 वर्षांपेक्षा कमी कारावास ("10 वर्षांपर्यंत" सुद्धा) (60 दिवस) निवडले')
  type('अटक (तारीख आणि वेळ, IST)', '2026-10-30T10:00', within(form))
  type('अटकेचे ठिकाण', 'Testpur', within(form))
  type(/कळवलेला नातेवाईक/, 'Fictional Relative', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'जतन करा' }))
  expect((await within(form).findByText('व्यक्तीला सांगितलेली अटकेची कारणे लिहा (BNSS 47).')).getAttribute('role')).toBe('alert')
})

test('in Hindi an unknown section gives the no-suggestion note and an empty list says so', async () => {
  stub({ '/firs/f1/people': [people[1]], '/firs/f1/punishment-hint': { suggested: null, sections: [], unknown: ['BNS 999(9)'] } })
  render(<ScreenLangContext.Provider value="hi"><Arrests firId="f1" version={0} onSaved={() => {}} /></ScreenLangContext.Provider>)
  expect(await screen.findByText('अभी कुछ नहीं।')).toBeTruthy()
  expect(screen.getByText('पहले व्यक्ति को आरोपी के रूप में जोड़ें; केवल आरोपी को गिरफ़्तार किया जा सकता है।')).toBeTruthy()
})

test('BNSS 58: an arrest without a remand shows when to produce the person; a remand after the 24 hours is flagged', async () => {
  stub({ '/firs/f1/people': people, '/firs/f1/arrests': [
    { ...base, id: 'a1', first_remand_on: null, chargesheet_last_day: null, earlier_custody_days: 0, released_on: null, produce_by: '2026-09-13T02:30:00Z', remand_after_24_hours: false },
    { ...base, id: 'a2', person_label: 'A2', first_remand_on: '2026-09-15', chargesheet_last_day: '2026-11-13', earlier_custody_days: 0, released_on: null, produce_by: '2026-09-13T02:30:00Z', remand_after_24_hours: true },
    { ...base, id: 'a3', person_label: 'A3', first_remand_on: null, chargesheet_last_day: null, earlier_custody_days: 0, released_on: '2026-09-12', release_basis: 'bail', produce_by: '2026-09-13T02:30:00Z', remand_after_24_hours: false },
  ] })
  render(<Arrests firId="f1" version={0} onSaved={vi.fn()} />)
  expect(await screen.findAllByText(/Produce before the Magistrate by 13 Sept 2026, 8:00 am IST/)).toHaveLength(1)   // not for the one released
  expect(screen.getAllByRole('note').map((n) => n.textContent)).toEqual([expect.stringContaining('after the day the 24 hours ended (BNSS 58)')])
})
