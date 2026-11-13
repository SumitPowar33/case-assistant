// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LawExplain from './LawExplain'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'
import type { Entry } from './lawExplain'

// Fictional data only (section numbers are the public numbers of the Acts).
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const entry: Entry = { law: 'IPC', newLaw: 'BNS', from: '420', to: '318', what: 'Cheating', partial: false }

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
const show = (lang = 'en') => render(<ScreenLangContext.Provider value={lang}><LawExplain entry={entry} /></ScreenLangContext.Provider>)
const ask = () => fireEvent.click(screen.getByRole('button', { name: 'Explain with AI' }))

test('the gateway gets only the two sections and the table description, and a helpful answer is logged as accepted', async () => {
  const calls = stub('BNS 318 took the place of IPC 420. Read the section in the Act.')
  show()
  fireEvent.change(screen.getByLabelText('Language of the explanation'), { target: { value: 'mr' } })
  ask()
  expect(await screen.findByText(/took the place of IPC 420/)).toBeTruthy()
  const sent = calls.find((c) => c.url.endsWith('/v1/generate'))!.body!
  expect(sent).toMatchObject({ feature: 'law_explain', prompt_version: 'law_explain/explain@1' })
  expect(sent).not.toHaveProperty('case_ref')
  expect(String(sent.prompt)).toContain('in Marathi')
  expect(String(sent.prompt)).toContain('IPC section 420')
  expect(String(sent.prompt)).toContain('BNS section 318')
  expect(String(sent.prompt)).toContain('Cheating')
  expect(screen.queryByText(/numbers that are not in the table/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Helpful' }))
  expect(await screen.findByText(/Your answer \(all kept\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ request_id: 'r1', decision: 'accepted', feature: 'law_explain' })
  expect(screen.queryByRole('button', { name: 'Helpful' })).toBeNull()
})

test('an explanation with numbers that are not in the table lists them, and "not helpful" is logged as rejected', async () => {
  const calls = stub('BNS 318 replaced IPC 420 in 2023, with a change in section 99.')
  show('xx')   // an unknown screen language starts in English
  expect((screen.getByLabelText('Language of the explanation') as HTMLSelectElement).value).toBe('en')
  ask()
  expect(await screen.findByText('The explanation has numbers that are not in the table: 2023, 99. Check them against the Act.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }))
  expect(await screen.findByText(/Your answer \(rejected\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected', feature: 'law_explain' })
})

test('the screen language starts the language of the explanation', () => {
  stub('x')
  show('hi')
  expect((screen.getByLabelText(/Language of the explanation|व्याख्या की भाषा/) as HTMLSelectElement).value).toBe('hi')
})

test('an explanation that gives an opinion, and an empty one, are not shown and are logged as rejected', async () => {
  let calls = stub('The person who did this is guilty.')
  show()
  ask()
  expect(await screen.findByText(/gave an opinion on guilt or truthfulness and is not shown/)).toBeTruthy()
  expect(screen.queryByText(/is guilty/)).toBeNull()
  expect(await screen.findByText(/Your answer \(rejected\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected', request_id: 'r1' })
  cleanup()
  calls = stub('   ')
  show()
  ask()
  expect(await screen.findByText(/The AI wrote no explanation/)).toBeTruthy()
  expect(calls.some((c) => c.url.endsWith('/v1/decisions'))).toBe(true)
})

test('a refusal by the gateway and a failed decision are shown to the officer', async () => {
  stub('', 'AI is switched off for this unit')
  show()
  ask()
  expect((await screen.findByRole('alert')).textContent).toContain('AI is switched off for this unit')
  cleanup()
  stub('BNS 318 took the place of IPC 420.', undefined, true)
  show()
  ask()
  fireEvent.click(await screen.findByRole('button', { name: 'Helpful' }))
  expect((await screen.findByRole('alert')).textContent).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Helpful' })).toBeTruthy()   // not logged, so the officer can try again
})
