// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AuditPage from './AuditPage'
import { CaseExport } from './AuditAi'
import AuditList from './AuditList'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'sho.one', full_name: 'SHO One', rank: 'Insp', role: 'sho', station_id: 's1', permissions: ['audit.read_protected'] } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); setSession(null) })

const cases = [{ id: 'f1', kind: 'fir', fir_id: 'f1', ref: '2026/7' }, { id: 'c1', kind: 'complaint', fir_id: 'f1', ref: '2026/7' }]
const event = (seq: number, extra = {}) => ({ seq, at: '2026-11-01T10:00:00+00:00', actor: 'u2', result: 'asked', feature: 'case_qa', label: 'Answer questions about the case file',
  provider: 'fake', model: 'fake-1', question_refused: null, case_id: 'f1', ...extra })
const people = [{ id: 'u2', full_name: 'SI Fictional Asha', rank: 'SI' }]

type Answer = { status?: number; body: unknown }
function stub(answer: (url: string, init?: RequestInit) => Answer | undefined) {
  const calls: { url: string; body?: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined })
    const a = answer(url, init) ?? (url.startsWith('/api/audit-log/people') ? { body: people } : { body: [] })
    return { ok: (a.status ?? 200) < 300, status: a.status ?? 200, json: async () => a.body }
  }))
  return calls
}

const list = () => render(<AuditList station="s1" cases={cases} version={0} />)
const aiOnly = () => fireEvent.click(screen.getByRole('button', { name: 'AI drafts and decisions' }))
const logRows = async () => within(await screen.findByRole('table', { name: 'Audit log of this police station, newest first' })).getAllByRole('row').slice(1)
const log = (at: string, kind = 'override', extra = {}) => ({ kind, at, who_name: 'SHO One', who_rank: 'Insp', what: 'certificate:x', reason: null, about: null, fir_id: null, fir_ref: null, ...extra })

test('the AI entries show who, what, the result, the model and the case', async () => {
  const calls = stub((url) => url.startsWith('/ai/v1/ai-events') ? { body: { events: [
    event(5, { result: 'refused', question_refused: 'guilt', model: null }),
    event(4, { result: 'accepted', model: null }),
    event(3, { feature: 'reply_scan', label: 'Read a scanned reply', actor: 'u9', case_id: 'c1' }),
    event(2, { feature: 'fir_extract', case_id: 'gone', result: 'failed' }),
    event(1, { feature: 'new_one', label: 'A feature added later', result: 'other' }),
  ] } } : undefined)
  list()
  expect(screen.getByText('Loading…')).toBeTruthy()
  const rows = await logRows()
  expect(rows).toHaveLength(5)
  expect(rows[0].textContent).toContain('SI Fictional Asha (SI)')
  expect(rows[0].textContent).toContain('AI Answer questions about the case file')
  expect(rows[0].textContent).toContain('Refused')
  expect(rows[0].textContent).toContain('Question about guilt, which the app does not answer')
  expect(within(rows[0]).getByRole('link', { name: 'FIR 2026/7' }).getAttribute('href')).toBe('#/firs/f1')
  expect(rows[1].textContent).toContain('Kept')
  expect(rows[2].textContent).toContain('Read a scanned reply (OCR on this server)')
  expect(rows[2].textContent).toContain('An account not of this state')
  expect(rows[2].textContent).toContain('Draft asked')
  expect(rows[2].textContent).toContain('Model: fake-1')
  expect(within(rows[2]).getByRole('link', { name: 'Complaint' }).getAttribute('href')).toBe('#/complaints/c1')
  expect(within(rows[3]).queryByRole('link')).toBeNull()
  expect(rows[4].textContent).toContain('A feature added later')
  expect(rows[4].textContent).toContain('other')
  expect(calls.map((c) => c.url)).toContain('/ai/v1/ai-events?station_id=s1&limit=100&offset=0')
  expect(calls.map((c) => c.url)).toContain('/api/audit-log/people?stationId=s1&id=u2&id=u9')
  expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
})

test('everything is one list, newest first; each filter asks only the server that has those entries', async () => {
  const calls = stub((url) => url.startsWith('/ai/') ? { body: { events: [event(2, { at: '2026-11-03T10:00:00+00:00' }), event(1, { at: '2026-11-01T10:00:00+00:00' })] } }
    : url.startsWith('/api/audit-log?') ? { body: [log('2026-11-04T10:00:00Z', 'admin_action', { what: 'user_disabled' }), log('2026-11-02T10:00:00Z', 'override', { reason: 'Fictional reason' })] } : undefined)
  list()
  const rows = await logRows()
  expect(rows).toHaveLength(4)
  expect(rows[0].textContent).toContain('Admin change')
  expect(rows[1].textContent).toContain('SI Fictional Asha')
  expect(rows[2].textContent).toContain('Reason: Fictional reason')
  expect(rows[3].textContent).toContain('SI Fictional Asha')
  expect(screen.getByRole('button', { name: 'Everything' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByLabelText('Show')).toBeNull()
  const asked = async (button: string) => {
    calls.length = 0
    fireEvent.click(screen.getByRole('button', { name: button }))
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.getByRole('button', { name: button }).getAttribute('aria-pressed')).toBe('true')
    return calls.map((c) => c.url).filter((u) => !u.startsWith('/api/audit-log/people'))
  }
  const url = '/api/audit-log?stationId=s1&limit=100&offset=0'
  expect(await asked('Protected details read')).toEqual([`${url}&kind=protected_read`])
  expect(await asked('Gap accepted')).toEqual([`${url}&kind=override&kind=override_withdrawn`])
  expect(await asked('Case audit exported')).toEqual([`${url}&kind=audit_export`])
  expect(await asked('Record checks')).toEqual([`${url}&kind=involvement_search&kind=cdr_read`])
  expect(await asked('Admin change')).toEqual([`${url}&kind=admin_action`])
  expect(await asked('AI drafts and decisions')).toEqual(['/ai/v1/ai-events?station_id=s1&limit=100&offset=0'])
})

test('a page is the newest of both lists, and the next one starts in each where it stopped', async () => {
  // 100 of each, taking turns in time: a page holds 50 of each
  const when = (i: number) => new Date(Date.UTC(2026, 10, 20) - i * 60000).toISOString()
  const calls = stub((url) => {
    const offset = Number(/offset=(\d+)/.exec(url)?.[1])
    if (url.startsWith('/ai/')) return { body: { events: offset >= 100 ? [] : Array.from({ length: 100 - offset }, (_, i) => event(500 - offset - i, { at: when(2 * (offset + i) + 1) })) } }
    if (url.startsWith('/api/audit-log?')) return { body: offset >= 100 ? [] : Array.from({ length: 100 - offset }, (_, i) => log(when(2 * (offset + i)))) }
    return undefined
  })
  list()
  expect(await logRows()).toHaveLength(100)
  expect(screen.queryByRole('button', { name: 'Newer' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Older' }))
  await waitFor(() => expect(calls.some((c) => c.url === '/api/audit-log?stationId=s1&limit=100&offset=50')).toBe(true))
  expect(calls.some((c) => c.url === '/ai/v1/ai-events?station_id=s1&limit=100&offset=50')).toBe(true)
  expect(await logRows()).toHaveLength(100)
  expect(screen.queryByRole('button', { name: 'Older' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Newer' }))
  expect(await screen.findByRole('button', { name: 'Older' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Newer' })).toBeNull()
})

test('the AI entries are narrowed to a result and walked a page at a time; officers are asked for fifty at a time', async () => {
  const full = Array.from({ length: 100 }, (_, i) => event(200 - i, { actor: `p${i}` }))
  const calls = stub((url) => url.startsWith('/ai/') ? { body: { events: url.includes('offset=100') || url.includes('result=edited') ? [] : full } } : undefined)
  list()
  aiOnly()
  await screen.findByRole('table')
  expect(calls.filter((c) => c.url.startsWith('/api/audit-log/people')).map((c) => c.url.split('&id=').length - 1).slice(-2)).toEqual([50, 50])
  fireEvent.click(screen.getByRole('button', { name: 'Older' }))
  expect(await screen.findByText('No AI entries to show.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Newer' }))
  await screen.findByRole('table')
  fireEvent.click(screen.getByRole('button', { name: 'Older' }))
  fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'edited' } })
  await waitFor(() => expect(calls.some((c) => c.url === '/ai/v1/ai-events?station_id=s1&limit=100&offset=0&result=edited')).toBe(true))
})

test("a gateway that cannot answer is said so: the other entries are never shown as if they were all", async () => {
  stub((url) => url.startsWith('/ai/') ? { status: 503, body: { detail: 'core is down' } }
    : url.startsWith('/api/audit-log?') ? { body: [log('2026-11-04T10:00:00Z')] } : undefined)
  list()
  expect((await screen.findByRole('status')).textContent).toContain('The AI entries cannot be shown: ')
  expect(screen.getByRole('status').textContent).toContain('503: core is down')
  expect(await logRows()).toHaveLength(1)
  aiOnly()
  expect((await screen.findByRole('alert')).textContent).toContain('503: core is down')
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByText('No AI entries to show.')).toBeNull()
})

test('an empty filter says so', async () => {
  stub((url) => url.startsWith('/ai/') ? { body: { events: [] } } : undefined)
  list()
  expect(await screen.findByText('Nothing in the audit log of this police station.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Admin change' }))
  expect(await screen.findByText('No entries of this kind.')).toBeTruthy()
})

function download() {
  const files: { name: string; blob: Blob }[] = []
  let blob: Blob
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { blob = b; return 'blob:x' }, revokeObjectURL: () => {} }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { files.push({ name: this.download, blob }) })
  return files
}
const answer = { fir_ref: '2026/7', station_name: 'Fictional Cyber PS', exported_by_name: 'SHO One', exported_by_rank: 'Insp', reasons_withheld: false,
  rows: [{ kind: 'override', at: '2026-11-03T10:00:00Z', who_name: 'SHO One', who_rank: 'Insp', what: 'certificate:x', reason: 'Fictional reason' }] }
const ask = () => {
  fireEvent.change(screen.getByLabelText('Which court or inquiry asked, and why (10 characters or more)'), { target: { value: 'Fictional court asked' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save the file' }).closest('form')!)
}
const read = (b: Blob) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b) })

test('one case is saved as a file with every page of its AI entries, then the log is read again', async () => {
  const files = download()
  const done = vi.fn()
  const first = Array.from({ length: 200 }, (_, i) => event(500 - i))
  const calls = stub((url) => url.startsWith('/ai/') ? { body: { events: url.includes('offset=0') ? first : [event(301), event(300)] } }
    : url === '/api/audit-log/exports' ? { body: answer } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={done} />)
  expect(within(screen.getByLabelText('FIR to export')).getAllByRole('option').map((o) => o.textContent)).toEqual(['FIR 2026/7'])
  ask()
  expect((await screen.findByRole('status')).textContent).toBe('Saved audit-FIR-2026-7.csv.')
  expect(calls.map((c) => c.url)).toEqual(['/ai/v1/ai-events?station_id=s1&fir_id=f1&limit=200&offset=0', '/ai/v1/ai-events?station_id=s1&fir_id=f1&limit=200&offset=200',
    '/api/audit-log/people?stationId=s1&id=u2', '/api/audit-log/exports'])
  expect(JSON.parse(calls[3].body!)).toEqual({ firId: 'f1', reason: 'Fictional court asked' })
  expect(files[0].name).toBe('audit-FIR-2026-7.csv')
  const csv = await read(files[0].blob)
  // 201 AI entries (the one on both pages once) and the application's one
  expect(csv).toContain('"Entries","202"')
  expect(done).toHaveBeenCalledTimes(1)
})

test('a file that leaves out the written reasons says so on the screen', async () => {
  download()
  stub((url) => url.startsWith('/ai/') ? { body: { events: [] } } : url === '/api/audit-log/exports' ? { body: { ...answer, reasons_withheld: true } } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={() => {}} />)
  ask()
  expect((await screen.findByRole('status')).textContent).toContain('are left out')
})

test('without the AI entries no export is made or logged; a refusal of the core is shown', async () => {
  const files = download()
  const calls = stub((url) => url.startsWith('/ai/') ? { status: 503, body: {} } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={() => {}} />)
  ask()
  expect((await screen.findByRole('alert')).textContent).toContain('503')
  expect(calls.some((c) => c.url === '/api/audit-log/exports')).toBe(false)
  cleanup()
  stub((url) => url.startsWith('/ai/') ? { body: { events: [] } } : url === '/api/audit-log/exports' ? { status: 404, body: { message: 'No such FIR.' } } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={() => {}} />)
  ask()
  expect((await screen.findByRole('alert')).textContent).toBe('No such FIR.')
  expect(files).toHaveLength(0)
})

test('a file that would be cut short is not made; an empty reason sends nothing; a station without FIRs has no form', async () => {
  const files = download()
  let n = 100000
  const calls = stub((url) => url.startsWith('/ai/') ? { body: { events: Array.from({ length: 200 }, () => event(n--)) } } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={() => {}} />)
  fireEvent.submit(screen.getByRole('button', { name: 'Save the file' }).closest('form')!)
  expect(calls).toHaveLength(0)
  ask()
  expect((await screen.findByRole('alert', undefined, { timeout: 20000 })).textContent).toContain('More than 10000 AI entries')
  expect(calls.some((c) => c.url === '/api/audit-log/exports')).toBe(false)
  expect(files).toHaveLength(0)
  cleanup()
  const { container } = render(<CaseExport station="s1" cases={[cases[1]]} onDone={() => {}} />)
  expect(container.textContent).toBe('')
}, 30000)

test('on the audit screen a saved export reads the log again', async () => {
  download()
  const calls = stub((url) => url === '/api/stations' ? { body: [{ id: 's1', state_code: 'IN', district: 'Demo District', name: 'Demo Cyber PS' }] }
    : url.startsWith('/api/audit-log/cases') ? { body: cases }
      : url.startsWith('/ai/v1/ai-events') ? { body: { events: [] } } : url.startsWith('/ai/') ? { body: { features: [] } }
        : url === '/api/audit-log/exports' ? { body: answer } : undefined)
  render(<AuditPage />)
  await screen.findByRole('button', { name: 'Save the file' })
  const reads = () => calls.filter((c) => c.url.startsWith('/api/audit-log?')).length
  expect(reads()).toBe(1)
  ask()
  await screen.findByRole('status')
  await waitFor(() => expect(reads()).toBe(2))
})

test('one case is printed as a court paper with the same entries; the export is logged', async () => {
  const files = download()
  const print = vi.fn()
  vi.stubGlobal('print', print)
  const done = vi.fn()
  const calls = stub((url) => url.startsWith('/ai/') ? { body: { events: [event(3, { at: '2026-11-04T10:00:00+00:00', result: 'accepted' })] } }
    : url === '/api/audit-log/exports' ? { body: { ...answer, reasons_withheld: true } } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={done} />)
  fireEvent.change(screen.getByLabelText('Which court or inquiry asked, and why (10 characters or more)'), { target: { value: 'Fictional court asked' } })
  fireEvent.click(screen.getByRole('button', { name: 'Print as a court paper' }))
  const paper = await screen.findByRole('article', { name: 'Audit entries of one case' })
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
  expect(files).toHaveLength(0)
  expect(JSON.parse(calls.find((c) => c.url === '/api/audit-log/exports')!.body!)).toEqual({ firId: 'f1', reason: 'Fictional court asked' })
  expect(done).toHaveBeenCalledTimes(1)
  expect(paper.className).toContain('print-copy')
  expect(paper.querySelector('.paper-running thead')!.textContent).toBe('FIR 2026/7, Fictional Cyber PS')
  expect([...paper.querySelectorAll('.paper-items li')].map((l) => l.textContent)).toEqual(
    ['FIR: 2026/7', 'Police station: Fictional Cyber PS', 'Exported by: SHO One (Insp)', expect.stringMatching(/^Exported on: .* IST$/), 'Entries: 2'])
  expect(paper.textContent).toContain('are left out')
  const rows = within(paper.querySelector<HTMLElement>('.paper-items + p ~ table')!).getAllByRole('row').slice(1)
  expect(rows[0].textContent).toBe('2026-11-03 15:30:00 ISTSHO One (Insp)Gap accepted: Electronic evidence without a complete BSA 63(4) certificate (certificate:x)Reason: Fictional reason')
  expect(rows[1].textContent).toContain('SI Fictional Asha (SI)AI: accepted: Answer questions about the case file; model fake fake-1')
  expect(paper.textContent).toContain('Signature of the officer who took the export')
  expect(screen.getByRole('status').textContent).toContain('The paper of FIR 2026/7 is below')
  expect(screen.getByRole('status').textContent).toContain('are left out')
  // a later export that fails leaves no earlier paper to be printed by mistake
  stub((url) => url.startsWith('/ai/') ? { status: 503, body: {} } : undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Print as a court paper' }))
  await screen.findByRole('alert')
  expect(screen.queryByRole('article')).toBeNull()
  expect(print).toHaveBeenCalledTimes(1)
})

test('an entry by an account the core does not name is on the paper by its id', async () => {
  download()
  vi.stubGlobal('print', vi.fn())
  stub((url) => url.startsWith('/ai/') ? { body: { events: [event(1, { actor: 'u9', model: null, provider: null })] } }
    : url === '/api/audit-log/exports' ? { body: { ...answer, rows: [] } } : undefined)
  render(<CaseExport station="s1" cases={cases} onDone={() => {}} />)
  fireEvent.change(screen.getByLabelText('Which court or inquiry asked, and why (10 characters or more)'), { target: { value: 'Fictional court asked' } })
  fireEvent.click(screen.getByRole('button', { name: 'Print as a court paper' }))
  expect((await screen.findByRole('article')).textContent).toContain('Account u9AI: asked')
})

test('a record check is shown as the core wrote it, and a case without a number is still linked', async () => {
  stub((url) => url.startsWith('/ai/') ? { body: { events: [event(1, { at: '2026-11-01T10:00:00+00:00' })] } }
    : url.startsWith('/api/audit-log?') ? { body: [log('2026-11-02T10:00:00Z', 'involvement_search', { what: 'A1: 2' })] } : undefined)
  const unnumbered = [{ id: 'f1', kind: 'fir', fir_id: 'f1', ref: null }]
  render(<><AuditList station="s1" cases={unnumbered} version={0} /><CaseExport station="s1" cases={unnumbered} onDone={() => {}} /></>)
  const rows = await logRows()
  expect(rows[0].textContent).toContain('A1: 2')
  expect(rows[0].textContent).toContain('Earlier records checked')
  expect(within(rows[1]).getByRole('link', { name: 'FIR' }).getAttribute('href')).toBe('#/firs/f1')
  expect(within(screen.getByLabelText('FIR to export')).getByRole('option').textContent).toBe('FIR ')
})
