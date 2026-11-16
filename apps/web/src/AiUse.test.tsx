// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { AiUseCase, AiUseState } from './AiUse'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', permissions: ['audit.read_protected'] } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const row = (feature: string, label: string, extra = {}) => ({ feature, label, asked: 3, accepted: 1, edited: 1, rejected: 1, refused: 2, failed: 0, embedded: 0, ...extra })

function stub(status: number, body: unknown) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    return { ok: status < 300, status, json: async () => body }
  }))
  return urls
}

test('the case block shows the counts per feature, read from the gateway for this case only', async () => {
  const urls = stub(200, { case_ref: 'f1', features: [row('case_qa', 'Answer questions about the case file'), row('embed', 'Search the case file by meaning', { asked: 0, accepted: 0, edited: 0, rejected: 0, refused: 0, embedded: 7 })], events: [] })
  render(<AiUseCase firId="f1" />)
  const rows = within(await screen.findByRole('table', { name: 'AI use, by feature' })).getAllByRole('row')
  expect(rows).toHaveLength(3)
  expect(Array.from(rows[1].querySelectorAll('td')).map((c) => c.textContent)).toEqual(['Answer questions about the case file', '3', '1', '1', '1', '2', '0', '0'])
  expect(rows[2].textContent).toContain('7')
  expect(screen.getByRole('heading', { name: 'AI use in this case' })).toBeTruthy()
  expect(urls).toEqual(['/ai/v1/ai-use?case_ref=f1'])
})

test('a case where the AI was never used says so; the gateway refusal is shown as it is', async () => {
  stub(200, { case_ref: 'f1', features: [], events: [] })
  const { unmount } = render(<AiUseCase firId="f1" />)
  expect(await screen.findByText('The AI has not been used in this case.')).toBeTruthy()
  unmount()
  stub(404, { detail: 'no case of your case team with that id' })
  render(<AiUseCase firId="f9" />)
  expect((await screen.findByRole('alert')).textContent).toBe('The AI gateway answered 404: no case of your case team with that id')
})

test('the state block shows the last 30 days; an empty window and a refusal are said plainly', async () => {
  const urls = stub(200, { days: 30, features: [row('law_explain', 'Explain an old-to-new law section in plain words')] })
  const { unmount } = render(<AiUseState />)
  expect(await screen.findByRole('heading', { name: 'AI use in the state, last 30 days' })).toBeTruthy()
  expect((await screen.findAllByRole('row'))).toHaveLength(2)
  expect(urls).toEqual(['/ai/v1/ai-use/summary?days=30'])
  unmount()
  stub(200, { days: 30, features: [] })
  const second = render(<AiUseState />)
  expect(await screen.findByText('The AI has not been used in the last 30 days.')).toBeTruthy()
  second.unmount()
  stub(403, { detail: 'your role cannot read the audit log' })
  render(<AiUseState />)
  expect((await screen.findByRole('alert')).textContent).toContain('403: your role cannot read the audit log')
})

test('a page closed before the answer comes does not set state afterwards', async () => {
  stub(200, { features: [] })
  render(<AiUseState />).unmount()
  await new Promise((r) => setTimeout(r, 10))
})
