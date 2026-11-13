// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import VictimLetter from './VictimLetter'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(draft: string, fail?: string, failDecision = false) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/v1/generate')) {
      if (fail) return { ok: false, status: 403, json: async () => ({ detail: fail }) }
      return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft, provider: 'fake', model: 'echo' }) }
    }
    if (failDecision) return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ logged: 3 }) }
  }))
  return calls
}
const show = (lang = 'en') => render(<ScreenLangContext.Provider value={lang}><VictimLetter firId="f1" firNo={214} firYear={2026} registeredAt="2026-11-03T20:00:00Z" /></ScreenLangContext.Provider>)
const draftIt = () => fireEvent.click(screen.getByRole('button', { name: 'Draft the letter with AI' }))

test('the officer ticks steps, the gateway gets only the FIR number, day and steps, and a used letter is logged as accepted', async () => {
  const calls = stub('FIR 214/2026 was registered on 4 November 2026. The inquiry continues.')
  show()
  fireEvent.click(screen.getByLabelText('Items have been sent to an expert or a laboratory'))
  fireEvent.click(screen.getByLabelText('Items have been sent to an expert or a laboratory'))   // ticked, then unticked
  fireEvent.click(screen.getByLabelText('Information has been asked from banks, telecom companies or other offices'))
  fireEvent.change(screen.getByLabelText('Language of the letter'), { target: { value: 'mr' } })
  draftIt()
  const box = (await screen.findByLabelText('Letter to the victim or informant')) as HTMLTextAreaElement
  const sent = calls.find((c) => c.url.endsWith('/v1/generate'))!.body!
  expect(sent).toMatchObject({ feature: 'victim_update', case_ref: 'f1', prompt_version: 'victim_update/letter@1' })
  expect(String(sent.prompt)).toContain('in Marathi')
  expect(String(sent.prompt)).toContain('registered on 4 November 2026')
  expect(String(sent.prompt)).toContain('information has been asked from banks')
  expect(String(sent.prompt)).not.toContain('expert')
  expect(box.value).toContain('The inquiry continues.')
  expect(screen.queryByText(/numbers that are not in the facts/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Use this letter' }))
  expect(await screen.findByText(/Your decision \(all kept\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ request_id: 'r1', decision: 'accepted', feature: 'victim_update', case_ref: 'f1' })
  expect(box.readOnly).toBe(true)
  expect(screen.queryByRole('button', { name: 'Draft the letter with AI' })).toBeNull()
})

test('the letter language starts as the screen language', () => {
  stub('')
  show('mr')
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('mr')
})

test('a letter the officer changes is logged as edited; an odd number is flagged; an unknown screen language falls back to English', async () => {
  const calls = stub('Registered on 4 November 2026. Call within 7 weeks.')
  show('xx')
  expect((screen.getByLabelText('Language of the letter') as HTMLSelectElement).value).toBe('en')
  draftIt()
  const box = (await screen.findByLabelText('Letter to the victim or informant')) as HTMLTextAreaElement
  expect(screen.getByText(/numbers that are not in the facts you gave: 7/)).toBeTruthy()
  fireEvent.change(box, { target: { value: 'Registered on 4 November 2026.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use this letter' }))
  expect(await screen.findByText(/Your decision \(partly kept or corrected\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'edited' })
})

test('the officer can reject a letter and the decision is logged', async () => {
  const calls = stub('A letter.')
  show()
  draftIt()
  await screen.findByLabelText('Letter to the victim or informant')
  fireEvent.click(screen.getByRole('button', { name: 'Do not use it' }))
  expect(await screen.findByText(/Your decision \(rejected\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected' })
})

test.each([['The accused is guilty of the offence.', /gave an opinion on guilt/], ['Arrest will definitely follow.', /promised a result/], ['  ', /wrote no letter/]])(
  'a letter that is %j is not shown, the refusal is logged and the officer can try again', async (draft, message) => {
    const calls = stub(draft)
    show()
    draftIt()
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.queryByLabelText('Letter to the victim or informant')).toBeNull()
    expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected' })
    expect(screen.getByRole('button', { name: 'Draft the letter with AI' })).toBeTruthy()
  })

test('a refusal by the gateway and a failed log are shown and nothing is lost', async () => {
  stub('', 'cloud not allowed for this unit')
  show()
  draftIt()
  expect(await screen.findByText(/cloud not allowed for this unit/)).toBeTruthy()
  cleanup()
  stub('A letter.', undefined, true)
  show()
  draftIt()
  await screen.findByLabelText('Letter to the victim or informant')
  fireEvent.click(screen.getByRole('button', { name: 'Use this letter' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use this letter' })).toBeTruthy()
})
