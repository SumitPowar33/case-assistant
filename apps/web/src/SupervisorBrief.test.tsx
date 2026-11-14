// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SupervisorBrief from './SupervisorBrief'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.fictional', full_name: 'Insp Fictional', rank: 'PI', role: 'sho', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const row = {
  id: 'f1', fir_no: 7, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional Asha',
  deadline_kind: 'chargesheet_custody', due_on: '2026-11-20', days_left: 6, report_status: 'submitted',
}
const readiness = { gaps: [{ key: 'second-link:p9', message: 'Fictional Ravi A1 is an account holder with no independent second link yet.', override: null }] }

function stub(draft: string, opts: { fail?: string; failDecision?: boolean; failReadiness?: boolean } = {}) {
  const calls: { url: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/readiness')) return opts.failReadiness ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => readiness }
    if (url.endsWith('/v1/generate')) {
      if (opts.fail) return { ok: false, status: 403, json: async () => ({ detail: opts.fail }) }
      return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft, provider: 'fake', model: 'echo' }) }
    }
    if (opts.failDecision) return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ logged: 3 }) }
  }))
  return calls
}
const show = (lang = 'en', ioLeft = false) =>
  render(<ScreenLangContext.Provider value={lang}><SupervisorBrief row={row} ioLeft={ioLeft} /></ScreenLangContext.Provider>)
const ask = () => fireEvent.click(screen.getByRole('button', { name: 'Brief me with AI' }))
const good = JSON.stringify([
  { text: 'The chargesheet is due on 20 November 2026, in 6 days.', facts: ['F2'] },
  { text: 'An account holder still lacks a second link.', facts: ['F3'] },
  { text: 'The IO is slow and careless.', facts: ['F5'] },
  { text: 'It is due in 3 days.', facts: ['F2'] },
])

test('the gateway gets numbered facts without any name, the sentences show their facts, and "useful" is logged as accepted', async () => {
  const calls = stub(good)
  show()
  fireEvent.change(screen.getByLabelText('Language of the briefing'), { target: { value: 'mr' } })
  ask()
  expect(await screen.findByText('The chargesheet is due on 20 November 2026, in 6 days.')).toBeTruthy()
  expect(screen.getByText('From: readiness gap: an account holder has no independent second link yet')).toBeTruthy()
  expect(screen.queryByText(/slow and careless/)).toBeNull()
  expect(screen.queryByText(/in 3 days/)).toBeNull()
  expect(screen.getByRole('note').textContent).toContain('Not shown: 1 sentences that named no fact or had numbers not in the facts, 1 that rated')
  const sent = calls.find((c) => c.url.endsWith('/v1/generate'))!.body!
  expect(sent).toMatchObject({ feature: 'supervisor_brief', prompt_version: 'supervisor_brief/case@1', case_ref: 'f1' })
  expect(String(sent.prompt)).toContain('in Marathi')
  expect(String(sent.prompt)).toContain('F1: FIR 7/2026, sections: BNS 318(4)')
  expect(String(sent.prompt)).not.toMatch(/Fictional|Asha|Ravi/)
  fireEvent.click(screen.getByRole('button', { name: 'Useful' }))
  expect(await screen.findByText(/Your answer \(all kept\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ request_id: 'r1', decision: 'accepted', feature: 'supervisor_brief', case_ref: 'f1' })
  expect(screen.queryByRole('button', { name: 'Useful' })).toBeNull()
})

test('"not useful" is logged as rejected; an IO who left is said in the facts', async () => {
  const calls = stub(good)
  show('xx', true)   // an unknown screen language starts in English
  expect((screen.getByLabelText('Language of the briefing') as HTMLSelectElement).value).toBe('en')
  ask()
  await screen.findByText('An account holder still lacks a second link.')
  expect(String(calls.find((c) => c.url.endsWith('/v1/generate'))!.body!.prompt)).toContain('has left the station')
  fireEvent.click(screen.getByRole('button', { name: 'Not useful' }))
  expect(await screen.findByText(/Your answer \(rejected\) is logged/)).toBeTruthy()
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected' })
})

test('an unreadable answer and one with no grounded sentence are not shown and are logged as rejected', async () => {
  let calls = stub('I cannot help with that.')
  show()
  ask()
  expect(await screen.findByText(/could not be read/)).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('rejected')
  expect(calls.find((c) => c.url.endsWith('/v1/decisions'))!.body).toMatchObject({ decision: 'rejected', feature: 'supervisor_brief' })
  cleanup()
  calls = stub(JSON.stringify([{ text: 'The officer did a poor job.', facts: ['F5'] }]))
  show()
  ask()
  expect(await screen.findByText(/No sentence of the AI's briefing rested on the facts/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Useful' })).toBeNull()
  expect(calls.some((c) => c.url.endsWith('/v1/decisions'))).toBe(true)
})

test('the gateway\'s refusal, a readiness read that fails and a decision that fails are shown', async () => {
  stub(good, { fail: 'This case is outside your case team.' })
  show()
  ask()
  expect((await screen.findByRole('alert')).textContent).toContain('outside your case team')
  cleanup()
  const calls = stub(good, { failReadiness: true })
  show()
  ask()
  expect((await screen.findByRole('alert')).textContent).toContain('404')
  expect(calls.some((c) => c.url.endsWith('/v1/generate'))).toBe(false)
  cleanup()
  stub(good, { failDecision: true })
  show()
  ask()
  fireEvent.click(await screen.findByRole('button', { name: 'Useful' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Useful' })).toBeTruthy()
})
