// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Notices from './Notices'
import Certificates from './Certificates'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

/** GETs answer from `lists` by path; writes answer `write` and are recorded. */
function stub(lists: Record<string, unknown>, write: { status: number; body: unknown } = { status: 201, body: { id: 'n1' } }) {
  const writes: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      return { ok: write.status < 300, status: write.status, json: async () => write.body }
    }
    return { ok: true, status: 200, json: async () => lists[url.replace('/api', '')] ?? [] }
  }))
  return writes
}
const type = (label: string | RegExp, value: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) => fireEvent.change(scope.getByLabelText(label), { target: { value } })

const sent = {
  id: 'n1', kind: 'BNSS_94', addressee: 'Nodal Officer, Fictional Bank', items_requested: ['Account statement', 'KYC documents'],
  items_missing: ['KYC documents'], status: 'reply_incomplete', issued_at: '2026-10-05T04:30:00Z', reply_due_on: '2026-10-12',
  signed_by_name: 'SI Fictional', replies: 1,
}

test('a notice shows what has come and what is still missing; a reply sends checks only for missing items', async () => {
  const writes = stub({ '/firs/f1/notices': [sent] })
  render(<Notices firId="f1" />)
  expect(await screen.findByText('Account statement: received')).toBeTruthy()
  expect(screen.getByText('KYC documents: not received yet')).toBeTruthy()
  expect(screen.getByText(/issued 5 Oct 2026, 10:00 am IST by SI Fictional/i)).toBeTruthy()
  const form = screen.getByText('Log a reply').closest('details')!
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByLabelText('KYC documents'))
  expect(within(form).queryByLabelText('Account statement')).toBeNull() // already received
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/notices/n1/replies', body: {
    receivedAt: '2026-10-11T15:00:00+05:30', channel: 'email', checksJson: '[{"item":"KYC documents","present":true}]' } })
})

test('a BNSS 94 notice needs items; sending now needs the issue time and is sent as signed', async () => {
  const writes = stub({ '/firs/f1/notices': [] })
  render(<Notices firId="f1" />)
  await screen.findByText('None yet.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type('Text of the notice', 'Please produce the records listed.')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/must list what is to be produced/)
  expect(writes).toHaveLength(0)
  type(/Items to produce/, 'CDR 01-09-2026 to 30-09-2026\n\nCDR 01-09-2026 to 30-09-2026\nBSA 63(4) certificate Part A')
  fireEvent.click(screen.getByLabelText('I sign and send it now'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/Give the date and time/)
  type(/^Issued/, '2026-10-05T10:00'); type(/^Reply due by/, '2026-10-12')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body).toEqual({ kind: 'BNSS_94', addressee: 'Nodal Officer, Fictional Telecom',
    itemsRequested: ['CDR 01-09-2026 to 30-09-2026', 'BSA 63(4) certificate Part A'], body: 'Please produce the records listed.',
    status: 'sent', issuedAt: '2026-10-05T10:00:00+05:30', replyDueOn: '2026-10-12' })
})

test('a draft can be signed and sent; it offers no reply form', async () => {
  const writes = stub({ '/firs/f1/notices': [{ ...sent, status: 'draft', issued_at: null, signed_by_name: null, replies: 0, items_missing: sent.items_requested }] },
    { status: 204, body: null })
  render(<Notices firId="f1" />)
  await screen.findByText(/draft \(not signed\)/)
  expect(screen.queryByText('Log a reply')).toBeNull()
  const form = screen.getByText('Sign and send this notice').closest('details')!
  type(/^Issued/, '2026-10-06T11:30', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/notices/n1/send', body: { issuedAt: '2026-10-06T11:30:00+05:30', replyDueOn: null } })
})

const SHA = 'b'.repeat(64)
const certA = { id: 'c1', part: 'A', signer_name: 'Fictional Signer', device_type: 'phone', device_ids: null, hash_algo: 'SHA256',
  hash_value: 'c'.repeat(64), signed_at: '2026-10-03T04:30:00Z', place: 'Testpur', supersedes: null, correction_reason: null, replaced_by: null }

test('certificates show whether the hash matches; a correction names what it replaces and needs a reason', async () => {
  const writes = stub({ '/firs/f1/evidence/e1/certificates': [certA] })
  render(<Certificates firId="f1" item={{ id: 'e1', label: 'E-01', sha256: SHA }} onSaved={() => {}} />)
  expect(await screen.findByText(/does not match the seizure hash/)).toBeTruthy()
  type('Signed by', 'Fictional Signer'); type('Device type', 'phone'); type('Place', 'Testpur')
  type('Hash as written on the certificate', 'abc')
  type(/^Signed \(date/, '2026-10-04T10:00')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/64 characters/)
  type('Hash as written on the certificate', SHA)
  type('Corrects an earlier certificate?', 'c1')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Say why/))
  type('Reason for the correction', 'hash re-read from the device')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0]).toEqual({ url: '/api/firs/f1/evidence/e1/certificates', body: { part: 'A', signerName: 'Fictional Signer', deviceType: 'phone',
    deviceIds: null, hashAlgo: 'SHA256', hashValue: SHA, signedAt: '2026-10-04T10:00:00+05:30', place: 'Testpur',
    supersedes: 'c1', correctionReason: 'hash re-read from the device' } })
})

test('a replaced certificate is marked and cannot be replaced again', async () => {
  stub({ '/firs/f1/evidence/e1/certificates': [{ ...certA, replaced_by: 'c2' },
    { ...certA, id: 'c2', hash_value: SHA, supersedes: 'c1', correction_reason: 'hash re-read from the device' }] })
  render(<Certificates firId="f1" item={{ id: 'e1', label: 'E-01', sha256: SHA }} onSaved={() => {}} />)
  expect(await screen.findByText('replaced by a correction')).toBeTruthy()
  expect(screen.getByText(/matches the seizure hash/)).toBeTruthy()
  const options = within(screen.getByLabelText('Corrects an earlier certificate?')).getAllByRole('option')
  expect(options).toHaveLength(2) // "No" and the current certificate only
})
