// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Readiness from './Readiness'
import { ScreenLangContext } from './i18n'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const report = {
  playbook: { id: 'cyber-fraud', version: '1.0.0-draft', status: 'draft', reviewNote: 'Must be reviewed by the prosecution.' },
  charges: [{ id: 'cheating', law: 'BNS 318(4)', label: 'Cheating', ingredients: [
    { id: 'deception', text: 'The victim was deceived', suggestedProof: ['complainant_statement'], evidence: [{ id: 'e1', linkId: 'l1', label: 'S-01', kind: 'document' }] },
    { id: 'delivery', text: 'Money was delivered', suggestedProof: ['bank_statement_certified'], evidence: [] },
  ] }],
  gaps: [{ key: 'ingredient:cheating/delivery', severity: 'critical', text: 'No evidence linked for: Money was delivered (BNS 318(4))', override: null },
    { key: 'certificate:e9', severity: 'critical', text: 'E-01 is electronic evidence without a complete BSA 63(4) certificate', override: { id: 'o1', reason: 'Bank asked again on 5 Oct', decidedBy: 'SI Fictional', decidedAt: '' } }],
  openGaps: 1, sectionsNotInPlaybook: ['BNS 3(5)'], checksToConfirm: [{ id: 'bank_officer_witness', severity: 'high', text: 'Record the bank nodal officer statement.' }],
}

function mock(answer: (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body && JSON.parse(init.body as string) })
    const special = answer(url, init)
    if (special) return { ok: special.status < 300, status: special.status, json: async () => special.body }
    const body = url.endsWith('/readiness') ? report : url === '/api/playbooks' ? [] : url.endsWith('/evidence') ? [{ id: 'e1', label: 'S-01', kind: 'document' }]
      : url.endsWith('/people') ? [{ id: 'p1', role: 'accused', label: 'A1', display_name: 'Fictional One' }, { id: 'p2', role: 'accused', label: 'A2', display_name: 'Fictional Two' },
        { id: 'p3', role: 'victim', label: 'V1', display_name: 'Victim V1' }] : undefined
    return { ok: !!body, status: body ? 200 : 404, json: async () => body }
  }))
  return calls
}

test('shows ingredients, linked evidence, open and accepted gaps, and no score', async () => {
  mock(() => undefined)
  render(<Readiness firId="f1" />)
  expect(await screen.findByText(/1 open gap\./)).toBeTruthy()
  expect(screen.getByText('draft')).toBeTruthy()
  expect(screen.getByText(/nothing linked \(for example: bank statement certified\)/)).toBeTruthy()
  expect(screen.getByText(/Accepted by SI Fictional: “Bank asked again on 5 Oct”/)).toBeTruthy()
  expect(screen.getByText(/Not checked by this playbook: BNS 3\(5\)/)).toBeTruthy()
  expect(screen.getByText('Record the bank nodal officer statement.')).toBeTruthy()
  expect(document.body.textContent).not.toMatch(/score|%/i)
})

test('accepting a gap sends the reason; a refusal from the server is shown', async () => {
  const calls = mock((url, init) => url.endsWith('/overrides') && init?.method === 'POST'
    ? { status: 403, body: { message: 'Only the case team can do this.' } } : undefined)
  render(<Readiness firId="f1" />)
  fireEvent.change(await screen.findByLabelText('Reason to accept this gap'), { target: { value: 'Bank reply due on 30 Oct' } })
  fireEvent.click(screen.getByRole('button', { name: 'Accept with reason' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Only the case team can do this.')
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ gapKey: 'ingredient:cheating/delivery', reason: 'Bank reply due on 30 Oct' })
})

test('linking evidence posts the chosen item and reloads the report', async () => {
  const calls = mock((url) => url.endsWith('/links') ? { status: 201, body: { id: 'l1' } } : undefined)
  render(<Readiness firId="f1" />)
  fireEvent.click((await screen.findAllByRole('button', { name: 'Link' }))[1])
  await screen.findByText(/1 open gap\./)
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ chargeId: 'cheating', ingredientId: 'delivery', evidenceItemId: 'e1' })
  await vi.waitFor(() => expect(calls.filter((c) => c.url.endsWith('/readiness')).length).toBe(2))
})

test('account holders: shows each holder and their independent links; marks a holder and adds a link', async () => {
  const withHolders = { ...report,
    secondLinkRule: { text: 'Money received in an account is not enough.', requiresAny: ['sim_or_device_link', 'kyc_identification'] },
    accountHolders: [{ personId: 'p1', name: 'A1 Fictional One', basis: 'Bank reply N-3', links: [] }] }
  const calls = mock((url, init) => url.endsWith('/readiness') ? { status: 200, body: withHolders }
    : init?.method && init.method !== 'GET' ? { status: url.endsWith('/account-holder') ? 204 : 201, body: {} } : undefined)
  render(<Readiness firId="f1" />)
  expect(await screen.findByText('no independent link yet')).toBeTruthy()
  expect(screen.getByText('Money received in an account is not enough.')).toBeTruthy()
  // only accused not yet marked are offered; never the victim
  const options = [...(screen.getByLabelText('Accused') as HTMLSelectElement).options].map((o) => o.textContent)
  expect(options).toEqual(['A2 Fictional Two'])
  fireEvent.change(screen.getByLabelText(/Basis/), { target: { value: 'Bank reply N-4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Mark as account holder' }))
  await vi.waitFor(() => expect(calls.find((c) => c.method === 'PUT')).toBeTruthy())
  expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: '/api/firs/f1/people/p2/account-holder', body: { basis: 'Bank reply N-4' } })
  await vi.waitFor(() => expect((screen.getByLabelText(/Basis/) as HTMLInputElement).value).toBe(''))

  fireEvent.change(screen.getByLabelText('Kind of link for A1 Fictional One'), { target: { value: 'kyc_identification' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
  await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy())
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ personId: 'p1', linkType: 'kyc_identification', evidenceItemId: 'e1' })
})

test('a link or an accepted gap is withdrawn with a reason; withdrawn records stay listed', async () => {
  const withHistory = { ...report, withdrawn: [{ what: 'evidence link', detail: 'S-02 for cheating/delivery', reason: 'Wrong item linked', withdrawn_by: 'SI Fictional', withdrawn_at: '' }] }
  const calls = mock((url, init) => url.endsWith('/readiness') ? { status: 200, body: withHistory }
    : init?.method === 'POST' ? { status: 204, body: null } : undefined)
  render(<Readiness firId="f1" />)
  expect(await screen.findByText(/evidence link: S-02 for cheating\/delivery\. Withdrawn by SI Fictional: “Wrong item linked”/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Reason to withdraw link of S-01'), { target: { value: 'Linked to the wrong ingredient' } })
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw link of S-01' }))
  await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy())
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/firs/f1/readiness/links/l1/withdraw', body: { reason: 'Linked to the wrong ingredient' } })
  fireEvent.change(screen.getByLabelText('Reason to withdraw acceptance'), { target: { value: 'Bank replied after all' } })
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw acceptance' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.method === 'POST').length).toBe(2))
  expect(calls.filter((c) => c.method === 'POST')[1].url).toBe('/api/firs/f1/readiness/overrides/o1/withdraw')
})

test('in Marathi the check, its gaps, the withdrawn list and the no-judging line are in Marathi; playbook texts and labels stay', async () => {
  mock((url) => url.endsWith('/readiness') ? { status: 200, body: { ...report, openGaps: 2,
    charges: [{ ...report.charges[0], ingredients: [{ ...report.charges[0].ingredients[0], evidence: [{ id: 'e2', linkId: 'l2', label: 'E-02', kind: 'electronic', courtReady: false }] }] }],
    withdrawn: [{ what: 'evidence link', detail: 'S-01 for cheating/deception', reason: 'Linked to the wrong item', withdrawn_by: 'SI Fictional', withdrawn_at: '' }] } } : undefined)
  render(<ScreenLangContext.Provider value="mr"><Readiness firId="f1" /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'तयारी तपासणी' })).toBeTruthy()
  expect(screen.getByText('2 त्रुटी उघड्या.')).toBeTruthy()
  expect(screen.getByText(/हे कोणाचेही मूल्यमापन करत नाही/)).toBeTruthy()
  expect(screen.getByText(/E-02 \(63\(4\) प्रमाणपत्र नाही\)/)).toBeTruthy()
  expect(screen.getByText('पुराव्याचा दुवा: S-01 for cheating/deception. SI Fictional यांनी मागे घेतले: “Linked to the wrong item”')).toBeTruthy()
  expect(screen.getByText(/SI Fictional यांनी स्वीकारले/)).toBeTruthy()
  expect(screen.getByText('Record the bank nodal officer statement.')).toBeTruthy()   // playbook text is not translated here
  expect(screen.getAllByRole('button', { name: /E-02 चा दुवा मागे घ्या/ })).toHaveLength(1)
})
