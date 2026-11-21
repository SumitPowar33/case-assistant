// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SectionReport from './SectionReport'
import { setSession } from './api'
import { istToday } from './formats'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const FIR = { fir_no: 214, fir_year: 2026, registered_at: '2026-08-18T05:30:00Z', sections: [{ act: 'BNS', section: '318(4)' }, { act: 'IT Act', section: '66D' }, { act: 'BNS', section: '319(2)' }] }
const WAITING = [
  { act: 'IT Act', section: '66D', added_at: '2026-08-19T19:00:00Z', reason: 'The caller used a phone to pose as the bank' },
  { act: 'BNS', section: '319(2)', added_at: '2026-08-21T06:00:00Z', reason: 'He said he was a bank officer' },
]
const SENT = { id: 'r1', court: 'Court of the Demo CJM', sent_on: '2026-08-22', report_text: 'To,\nThe Learned Magistrate', recorded_at: '', recorded_by_name: 'SI Fictional', sections: [{ act: 'BNS', section: '64' }] }

type Reply = { status: number; body: unknown }
function stub(list: Reply, save?: Reply) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = method === 'POST' ? save ?? { status: 201, body: { id: 'r2' } } : list
    return { ok: r.status < 300, status: r.status, json: async () => r.body }
  }))
  return calls
}
const show = (onSaved = () => undefined) => render(<SectionReport firId="f1" fir={FIR} version={0} onSaved={onSaved} />)

test('nothing is shown while no section was added after registration', async () => {
  const calls = stub({ status: 200, body: { reports: [], unreported: [], court: null } })
  const { container } = show()
  await vi.waitFor(() => expect(calls.length).toBe(1))
  expect(calls[0].url).toBe('/api/firs/f1/section-reports')
  expect(container.textContent).toBe('')
})

test('the officer drafts the report from the case, edits it, leaves one section for later and records it as sent', async () => {
  const calls = stub({ status: 200, body: { reports: [], unreported: WAITING, court: 'Court of the Demo CJM' } })
  const onSaved = vi.fn()
  show(onSaved)
  expect(await screen.findByText('Waiting for a report: IT Act 66D, BNS 319(2)')).toBeTruthy()
  expect((screen.getByLabelText('Court') as HTMLInputElement).value).toBe('Court of the Demo CJM')
  expect((screen.getByLabelText('Sent on') as HTMLInputElement).value).toBe(istToday())
  const save = screen.getByRole('button', { name: 'Record as sent' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)                     // no text yet
  fireEvent.click(screen.getByLabelText('BNS 319(2)'))
  fireEvent.click(screen.getByRole('button', { name: 'Draft the report' }))
  const text = screen.getByLabelText('Text of the report as sent') as HTMLTextAreaElement
  expect(text.value).toContain('Court of the Demo CJM')
  expect(text.value).toContain('1. IT Act 66D (added on 20.08.2026): The caller used a phone to pose as the bank')
  expect(text.value).not.toContain('319(2)')         // neither reported now nor a section of the registration
  expect(text.value).toContain('registered on 18.08.2026 under BNS 318(4).')
  fireEvent.change(text, { target: { value: text.value + '\nPS Fictional North  ' } })
  const sent = text.value.trim()
  fireEvent.change(screen.getByLabelText('Sent on'), { target: { value: '2026-08-22' } })
  fireEvent.click(save)
  expect(await screen.findByText('The report is recorded.')).toBeTruthy()
  const post = calls.find((c) => c.method === 'POST')!
  expect(post.url).toBe('/api/firs/f1/section-reports')
  expect(post.body).toEqual({ court: 'Court of the Demo CJM', sentOn: '2026-08-22', text: sent, sections: [{ act: 'IT Act', section: '66D' }] })
  expect(String(post.body!.text)).toMatch(/PS Fictional North$/)
  expect(text.value).toBe('')                          // cleared after the save
  expect(onSaved).toHaveBeenCalled()
})

test('no section chosen or no court: nothing can be drafted or recorded; a refusal is shown', async () => {
  stub({ status: 200, body: { reports: [], unreported: WAITING.slice(0, 1), court: null } }, { status: 422, body: { error: 'IT Act 66D was added on 2026-08-20; the report cannot be sent before that.' } })
  show()
  const box = await screen.findByLabelText('IT Act 66D')
  fireEvent.click(box)
  expect((screen.getByRole('button', { name: 'Draft the report' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(box)
  fireEvent.click(screen.getByRole('button', { name: 'Draft the report' }))
  expect((screen.getByLabelText('Text of the report as sent') as HTMLTextAreaElement).value).toContain('[court]')
  const save = screen.getByRole('button', { name: 'Record as sent' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Court'), { target: { value: 'Court of the Demo JMFC' } })
  fireEvent.click(save)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'IT Act 66D was added on 2026-08-20; the report cannot be sent before that.')
})

test('a recorded report shows its court, day, officer and text; with nothing waiting the card says so', async () => {
  stub({ status: 200, body: { reports: [SENT], unreported: [], court: 'Court of the Demo CJM' } })
  show()
  expect(await screen.findByText('BNS 64')).toBeTruthy()
  expect(screen.getByText('sent to Court of the Demo CJM on 22.08.2026, recorded by SI Fictional')).toBeTruthy()
  expect(screen.getByText('Every added section has been reported.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Record as sent' })).toBeNull()
})

test('an error reading the reports is shown', async () => {
  stub({ status: 500, body: { error: 'Server down' } })
  show()
  expect(await screen.findByRole('alert')).toBeTruthy()
})
