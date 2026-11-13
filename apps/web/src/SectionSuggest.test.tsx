// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import SectionSuggest from './SectionSuggest'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const TEXT = 'A caller said he was from my bank. He asked me for a code sent to my phone. Rs 40,000 went out of my account.'
const ing = (id: string) => ({ id, text: `The text of ${id}` })
const CHARGES = [
  { playbook_id: 'cyber-fraud', charge_id: 'cheating', act: 'BNS', law: 'BNS 318(4)', label: 'Cheating', ingredients: [ing('deception'), ing('delivery')], in_fir: true },
  { playbook_id: 'cyber-fraud', charge_id: 'personation', act: 'BNS', law: 'BNS 319(2)', label: 'Cheating by personation', ingredients: [ing('pretended_identity'), ing('no_such_officer')], in_fir: false },
  { playbook_id: 'cyber-fraud', charge_id: 'it_personation', act: 'IT Act', law: 'IT Act 66D', label: 'Personation by computer', ingredients: [ing('computer_resource'), ing('personation')], in_fir: false },
]
const ANSWER = [
  { charge: 'cyber-fraud/cheating', ingredients: [{ id: 'delivery', quote: 'Rs 40,000 went out of my account' }] },
  { charge: 'cyber-fraud/personation', ingredients: [{ id: 'pretended_identity', quote: 'he was from my bank' }] },
  { charge: 'cyber-fraud/it_personation', ingredients: [{ id: 'computer_resource', quote: 'a code sent to my phone' }, { id: 'personation', quote: 'not in the text' }] },
]
const basis = (law = 'unknown', sections: unknown[] = [{ act: 'BNS', section: '318(4)', added_at: null, reason: null, chosen_by_name: null }]) =>
  ({ status: 200, body: { law, sections, charges: CHARGES } })

type Reply = { status: number; body: unknown }
function stub(opts: { list?: Reply; save?: Reply; generate?: Reply; decision?: Reply } = {}) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = url.endsWith('generate') ? opts.generate : url.endsWith('decisions') ? opts.decision : method === 'POST' ? opts.save : opts.list ?? basis()
    const reply = r ?? { status: method === 'POST' ? 201 : 200, body: {} }
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }
  }))
  return calls
}
const draft = (text: string) => ({ status: 200, body: { request_id: 'r1', draft: text, provider: 'fake', model: 'm', label: 'AI draft - check before use' } })
const card = (name: string) => screen.getByRole('listitem', { name })
const show = (props: Partial<{ victimProtected: boolean; onSaved: () => void }> = {}) =>
  render(<SectionSuggest firId="f1" text={TEXT} victimProtected={props.victimProtected ?? false} version={0} onSaved={props.onSaved ?? (() => undefined)} />)

test('the AI suggestions show the playbook ingredients and the FIR words; the officer adds one with a reason and the decision is logged', async () => {
  const calls = stub({ generate: draft(JSON.stringify(ANSWER)) })
  const onSaved = vi.fn()
  show({ onSaved })
  expect(await screen.findByText(/The FIR does not record when the offence happened/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Suggest sections with AI' }))
  expect(await screen.findByText('AI draft · you choose the sections')).toBeTruthy()
  const gen = calls.find((c) => c.url === '/ai/v1/generate')!
  expect(gen.body).toMatchObject({ feature: 'section_suggest', prompt_version: 'section_suggest/playbook@1', case_ref: 'f1', max_tokens: 1500 })
  expect(String(gen.body!.prompt)).toContain(TEXT)
  expect(String(gen.body!.prompt)).toContain('cyber-fraud/personation: BNS 319(2)')
  expect(screen.getByText('1 answers of the AI did not point at a charge, an ingredient or words of the FIR text and are not shown.')).toBeTruthy()
  // the section already in the FIR is shown as such, with nothing to add
  expect(within(card('BNS 318(4)')).getByText('Already in the FIR')).toBeTruthy()
  expect(within(card('BNS 318(4)')).queryByRole('button', { name: 'Add to the FIR' })).toBeNull()
  // the playbook's own ingredient text, the words of the FIR, and what was not seen
  const it = card('IT Act 66D')
  expect(within(it).getByText('a code sent to my phone').tagName).toBe('MARK')
  expect(within(it).getByText(/The text of computer_resource/)).toBeTruthy()
  expect(within(it).getByText('Not seen in the text: The text of personation')).toBeTruthy()
  // a reason of 10 characters is needed before adding
  const add = within(it).getByRole('button', { name: 'Add to the FIR' })
  expect(add).toHaveProperty('disabled', true)
  fireEvent.change(within(it).getByLabelText('Why this section (at least 10 characters)'), { target: { value: '  The caller used a phone to pose as the bank  ' } })
  fireEvent.click(add)
  expect(await within(card('IT Act 66D')).findByText('Added to the FIR')).toBeTruthy()
  expect(calls.find((c) => c.method === 'POST' && c.url === '/api/firs/f1/sections')!.body)
    .toEqual({ playbookId: 'cyber-fraud', chargeId: 'it_personation', reason: 'The caller used a phone to pose as the bank', aiRequestId: 'r1' })
  expect(onSaved).toHaveBeenCalledTimes(1)
  fireEvent.click(within(card('BNS 319(2)')).getByRole('button', { name: 'Not this one' }))
  expect(within(card('BNS 319(2)')).getByText('Not added')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect(await screen.findByText('Your decision (partly kept or corrected) is logged.')).toBeTruthy()
  expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toEqual({ request_id: 'r1', decision: 'edited', feature: 'section_suggest', case_ref: 'f1',
    note: '1 of 2 suggested sections added, 1 already in the FIR or not of its law' })
})

test('for an offence under the IPC a BNS suggestion cannot be added and the law finder is linked', async () => {
  stub({ list: basis('old'), generate: draft(JSON.stringify(ANSWER.slice(1))) })
  show()
  expect(await screen.findByText(/the IPC applies, and a BNS section cannot be added/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Old to new law' }).getAttribute('href')).toBe('#/laws')
  fireEvent.click(screen.getByRole('button', { name: 'Suggest sections with AI' }))
  expect(within(await screen.findByRole('listitem', { name: 'BNS 319(2)' })).getByText('Not for this FIR: the IPC applies')).toBeTruthy()
  expect(within(card('IT Act 66D')).getByRole('button', { name: 'Add to the FIR' })).toBeTruthy()   // the IT Act was not replaced
})

test.each([['new', 'The offence is from 1 July 2024: the BNS applies.'], ['spans', /runs across 1 July 2024/]])('the law of a %s offence is said', async (law, text) => {
  stub({ list: basis(law) })
  show()
  expect(await screen.findByText(text)).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Old to new law' })).toBeNull()
})

test('sections added earlier are listed with who, when and why', async () => {
  stub({ list: basis('new', [{ act: 'BNS', section: '318(4)', added_at: null, reason: null, chosen_by_name: null },
    { act: 'IT Act', section: '66D', added_at: '2026-11-08T10:00:00Z', reason: 'The caller used a phone', chosen_by_name: 'SI Fictional' }]) })
  show()
  expect(await screen.findByText('IT Act 66D')).toBeTruthy()
  expect(screen.getByText(/added during the investigation by SI Fictional/)).toBeTruthy()
  expect(screen.getByText('The caller used a phone')).toBeTruthy()
  expect(screen.queryByText('BNS 318(4)')).toBeNull()   // the registration's own sections are on the FIR already
})

test('every suggestion added is accepted; none added is rejected; nothing to add is accepted; an unreadable answer is rejected', async () => {
  const run = async (answer: string, steps: () => Promise<void>, decision: string) => {
    const calls = stub({ generate: draft(answer) })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest sections with AI' }))
    await screen.findByText('AI draft · you choose the sections')
    await steps()
    fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
    await screen.findByText(/is logged/)
    expect(calls.find((c) => c.url === '/ai/v1/decisions')!.body).toMatchObject({ decision })
    cleanup()
  }
  await run(JSON.stringify(ANSWER.slice(1, 2)), async () => {
    fireEvent.change(screen.getByLabelText('Why this section (at least 10 characters)'), { target: { value: 'Posed as the bank officer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to the FIR' }))
    await screen.findByText('Added to the FIR')
  }, 'accepted')
  await run(JSON.stringify(ANSWER.slice(1)), async () => undefined, 'rejected')
  await run(JSON.stringify(ANSWER.slice(0, 1)), async () => undefined, 'accepted')
  await run('[]', async () => { expect(screen.getByText(/found no charge of the playbooks/)).toBeTruthy() }, 'accepted')
  await run('No list here', async () => { expect(screen.getByText(/could not be read as a list of charges/)).toBeTruthy() }, 'rejected')
})

test('a refused addition, a failed request and a failed log are shown, and nothing is marked', async () => {
  stub({ generate: draft(JSON.stringify(ANSWER.slice(2))), save: { status: 409, body: { message: 'This section is already in the FIR.' } }, decision: { status: 502, body: { detail: 'The gateway is down' } } })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest sections with AI' }))
  fireEvent.change(await screen.findByLabelText('Why this section (at least 10 characters)'), { target: { value: 'The caller used a phone' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add to the FIR' }))
  expect((await screen.findByRole('alert')).textContent).toBe('This section is already in the FIR.')
  expect(screen.getByRole('button', { name: 'Add to the FIR' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Finish the check' }))
  expect((await screen.findByRole('alert')).textContent).toContain('The gateway is down')
  expect(screen.getByRole('button', { name: 'Finish the check' })).toBeTruthy()
  cleanup()
  stub({ generate: { status: 429, body: { detail: 'Too many drafts' } } })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest sections with AI' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Too many drafts')
  expect(screen.queryByText('AI draft · you choose the sections')).toBeNull()
})

test('not offered on a protected case; a refused list is shown', async () => {
  stub()
  show({ victimProtected: true })
  expect(await screen.findByText(/not offered on a case that protects the victim's identity/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Suggest sections with AI' })).toBeNull()
  cleanup()
  stub({ list: { status: 404, body: { message: 'Not found' } } })
  show()
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('a suggested charge graver than every section on the FIR comes first and says so, with its punishment', async () => {
  const murder = { playbook_id: 'murder', charge_id: 'murder', act: 'BNS', law: 'BNS 103(1)', label: 'Murder', ingredients: [ing('death')], in_fir: false, punishment: 'death', graver: true }
  stub({ list: { status: 200, body: { law: 'unknown', sections: [], charges: [...CHARGES.map((c) => ({ ...c, punishment: 'less_than_10_years', graver: false })), murder] } },
    generate: draft(JSON.stringify([ANSWER[1], { charge: 'murder/murder', ingredients: [{ id: 'death', quote: 'Rs 40,000 went out of my account' }] }])) })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest sections with AI' }))
  const cards = await screen.findAllByRole('listitem', { name: /BNS/ })
  expect(cards[0].getAttribute('aria-label')).toBe('BNS 103(1)')
  expect(within(card('BNS 103(1)')).getByText('Graver than the sections on the FIR')).toBeTruthy()
  expect(within(card('BNS 103(1)')).getByText('death')).toBeTruthy()
  expect(within(card('BNS 319(2)')).queryByText('Graver than the sections on the FIR')).toBeNull()
})
