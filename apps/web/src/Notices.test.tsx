// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Notices from './Notices'
import Certificates from './Certificates'
import { setSession } from './api'
import { ScreenLangContext } from './i18n'

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
    receivedAt: '2026-10-11T15:00:00+05:30', channel: 'email', checksJson: '[{"item":"KYC documents","present":true},{"item":"certificate","present":false}]' } })
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
    aiRequestId: null, status: 'sent', issuedAt: '2026-10-05T10:00:00+05:30', replyDueOn: '2026-10-12' })
})

test('a BNSS 106 freeze notice must name the accounts to freeze', async () => {
  const writes = stub({ '/firs/f1/notices': [] })
  render(<Notices firId="f1" />)
  await screen.findByText('None yet.')
  fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'BNSS_106' } })
  type('To', 'Nodal Officer, Fictional Bank')
  type('Text of the notice', 'Debit-freeze the accounts listed.')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/must list the accounts to freeze/)
  type(/Items to produce/, 'FICT 0000 4471')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body).toMatchObject({ kind: 'BNSS_106', itemsRequested: ['FICT 0000 4471'], status: 'draft' })
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

const AI_TEXT = 'Notice under BNSS 94 in FIR No. 214/2026. Produce: CDR. [REPLY DUE DATE]'
/** Core and AI gateway both answer; every write is recorded with where it went. */
function stubWithAi(draft = AI_TEXT) {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  let n = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(init.body as string)
      writes.push({ url, body })
      if (url === '/ai/v1/generate') {
        n += 1
        return { ok: true, status: 200, json: async () => ({ request_id: `r${n}`, draft: `${draft}${n > 1 ? ' v' + n : ''}`, provider: 'fake', model: 'fake-1', label: 'AI draft - check before use' }) }
      }
      return { ok: true, status: url.startsWith('/ai') ? 200 : 201, json: async () => (url.startsWith('/ai') ? { logged: 1 } : { id: 'n9' }) }
    }
    return { ok: true, status: 200, json: async () => [] }
  }))
  return writes
}
const fir = { fir_no: 214, fir_year: 2026, sections: [{ act: 'BNS', section: '318(4)' }] }

test('an AI draft is shown apart, used only when the officer chooses, and an edited draft is logged as edited', async () => {
  const writes = stubWithAi()
  render(<Notices firId="f1" fir={fir} />)
  await screen.findByText('None yet.')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Fill in “To” first.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type(/Items to produce/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  const box = await screen.findByRole('region', { name: 'AI draft' })
  expect(within(box).getByText('AI draft - check before use')).toBeTruthy()
  expect(writes[0].url).toBe('/ai/v1/generate')
  expect(writes[0].body).toMatchObject({ feature: 'notice_draft', prompt_version: 'notice_draft/notice@2', case_ref: 'f1' })
  expect(writes[0].body.prompt).toContain('FIR No. 214/2026, registered under BNS 318(4)')
  expect((screen.getByLabelText('Text of the notice') as HTMLTextAreaElement).value).toBe('') // not copied until chosen
  fireEvent.click(within(box).getByRole('button', { name: 'Use this draft' }))
  expect((screen.getByLabelText('Text of the notice') as HTMLTextAreaElement).value).toBe(AI_TEXT)
  type('Text of the notice', AI_TEXT.replace('[REPLY DUE DATE]', '12-10-2026'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(writes[1]).toMatchObject({ url: '/api/firs/f1/notices', body: { aiRequestId: 'r1', status: 'draft' } })
  expect(writes[2]).toEqual({ url: '/ai/v1/decisions', body: { request_id: 'r1', decision: 'edited', feature: 'notice_draft', case_ref: 'f1', note: '' } })
})

test('a discarded draft is logged as rejected and never saved; a draft used unchanged is accepted', async () => {
  const writes = stubWithAi()
  render(<Notices firId="f1" fir={fir} />)
  await screen.findByText('None yet.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type(/Items to produce/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  fireEvent.click(within(await screen.findByRole('region', { name: 'AI draft' })).getByRole('button', { name: 'Discard' }))
  await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'AI draft' })).toBeNull())
  expect(writes[1].body).toMatchObject({ request_id: 'r1', decision: 'rejected' })
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  fireEvent.click(within(await screen.findByRole('region', { name: 'AI draft' })).getByRole('button', { name: 'Use this draft' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(5))
  expect(writes[3].body).toMatchObject({ aiRequestId: 'r2', body: AI_TEXT + ' v2' })
  expect(writes[4].body).toMatchObject({ request_id: 'r2', decision: 'accepted' })
})

test('a draft the officer used is not logged as rejected when another draft is asked for', async () => {
  const writes = stubWithAi()
  render(<Notices firId="f1" fir={fir} />)
  await screen.findByText('None yet.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type(/Items to produce/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  fireEvent.click(within(await screen.findByRole('region', { name: 'AI draft' })).getByRole('button', { name: 'Use this draft' }))
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  await screen.findByText(AI_TEXT + ' v2')
  expect(writes.map((w) => w.url)).toEqual(['/ai/v1/generate', '/ai/v1/generate'])   // r1 was used: no rejection logged for it
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

test('a current certificate is shown as a court-format paper and prints; a replaced one offers none', async () => {
  stub({ '/firs/f1/evidence/e1/certificates': [{ ...certA, device_ids: 'IMEI 000000000000000', replaced_by: 'c2' },
    { ...certA, id: 'c2', part: 'B', device_ids: 'IMEI 000000000000000', hash_value: SHA, supersedes: 'c1', correction_reason: 'hash re-read from the device' },
    { ...certA, id: 'c3', hash_algo: 'MD5' }] })
  const print = vi.fn()
  vi.stubGlobal('print', print)
  render(<Certificates firId="f1" item={{ id: 'e1', label: 'E-01', sha256: SHA }} onSaved={() => {}} />)
  const buttons = await screen.findAllByRole('button', { name: 'Show the certificate as paper' })
  expect(buttons).toHaveLength(2) // c2 and c3; c1 was replaced
  fireEvent.click(buttons[0])
  const paper = screen.getByLabelText('BSA 63(4) certificate, paper copy')
  expect(paper.className).toBe('print-copy')
  expect(within(paper).getByText('Certificate under BSA 63(4)')).toBeTruthy()
  expect(within(paper).getByText('Part B (expert)')).toBeTruthy()
  expect(within(paper).getByText('Electronic record: E-01.')).toBeTruthy()
  expect(within(paper).getByText('Given by: Fictional Signer.')).toBeTruthy()
  expect(within(paper).getByText('Device or source: phone (IMEI 000000000000000).')).toBeTruthy()
  expect(within(paper).getByText(`Hash value (SHA256): ${SHA}.`)).toBeTruthy()
  expect(within(paper).getByText(/^Signed on .* at Testpur\.$/)).toBeTruthy()
  expect(within(paper).getByText('correction: hash re-read from the device')).toBeTruthy()
  expect(within(paper).getByText('Signature of the person giving the certificate')).toBeTruthy()
  fireEvent.click(within(paper).getByRole('button', { name: 'Print the certificate' }))
  expect(print).toHaveBeenCalled()
  // the other certificate replaces the paper on screen, and has no correction line
  fireEvent.click(screen.getByRole('button', { name: 'Show the certificate as paper' }))
  const second = screen.getByLabelText('BSA 63(4) certificate, paper copy')
  expect(within(second).getByText('Part A (person in charge of the device)')).toBeTruthy()
  expect(within(second).getByText(`Hash value (MD5): ${'c'.repeat(64)}.`)).toBeTruthy()
  expect(within(second).getByText('Device or source: phone.')).toBeTruthy()
  expect(within(second).queryByText(/^correction:/)).toBeNull()
})

test('in Marathi a certificate reads in Marathi, and the form refuses a short hash and a correction of the other part in Marathi', async () => {
  stub({ '/firs/f1/evidence/e1/certificates': [{ ...certA, device_ids: 'IMEI 000000000000000' }] })
  render(<ScreenLangContext.Provider value="mr"><Certificates firId="f1" item={{ id: 'e1', label: 'E-01', sha256: SHA }} onSaved={() => {}} /></ScreenLangContext.Provider>)
  const line = (await screen.findByText(/जप्तीच्या हॅशशी जुळत नाही/)).closest('li')!
  expect(line.textContent).toMatch(/^भाग A \(उपकरणाचा प्रभारी\): Fictional Signer, phone \(IMEI 000000000000000\), .* रोजी Testpur येथे सही\. SHA256 जप्तीच्या/)
  expect(screen.getByText('E-01 साठी 63(4) प्रमाणपत्र जोडा')).toBeTruthy()
  expect(screen.getByRole('option', { name: /^A, Fictional Signer यांची सही, .* ऐवजी$/ })).toBeTruthy()
  type('सही करणारे', 'Fictional Signer'); type('उपकरणाचा प्रकार', 'phone'); type('ठिकाण', 'Testpur')
  type('प्रमाणपत्रावर लिहिलेला हॅश', 'abc')
  type(/^सही \(तारीख/, '2026-10-04T10:00')
  fireEvent.click(screen.getByRole('button', { name: 'जतन करा' }))
  expect((await screen.findByRole('alert')).textContent).toBe('SHA-256 हॅशमध्ये 64 अक्षरे असतात (0-9, a-f).')
  type('प्रमाणपत्रावर लिहिलेला हॅश', SHA)
  type('भाग', 'B')
  type('आधीच्या प्रमाणपत्राची दुरुस्ती?', 'c1')
  fireEvent.click(screen.getByRole('button', { name: 'जतन करा' }))
  await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('दुरुस्ती ज्या प्रमाणपत्राची जागा घेते त्याच भागाची असली पाहिजे.'))
})

test('an old notice loaded from a file keeps its CrPC section and may have no signer on record', async () => {
  stub({ '/firs/f1/notices': [{ ...sent, id: 'n9', kind: 'CrPC_41A', items_requested: [], items_missing: [], status: 'complete', signed_by_name: null, issued_at: '2024-03-11T04:30:00Z' }] })
  render(<Notices firId="f1" />)
  const item = (await screen.findByText('CrPC 41A (old law): appear')).closest('li')!
  expect(item.textContent).toContain('issued 11 Mar 2024, 10:00 am IST')
  expect(item.textContent).not.toContain('IST by')
  expect(screen.queryByRole('option', { name: /CrPC/ })).toBeNull()   // the form for a new notice offers BNSS kinds only
})

test('in Marathi the notice list, the reply and send forms and the new-notice form are in Marathi; the stored check and the AI prompt stay English', async () => {
  const writes = stubWithAi()
  vi.mocked(fetch).mockImplementation((async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      const lists: Record<string, unknown> = { '/api/firs/f1/notices': [
        { ...sent, ai_drafted: true, replies: 2 },
        { ...sent, id: 'n2', kind: 'BNSS_179', items_requested: [], items_missing: [], status: 'sent', signed_by_name: null, replies: 1, reply_due_on: null },
        { ...sent, id: 'n3', kind: 'a_new_kind', items_requested: [], items_missing: [], status: 'draft', issued_at: null, reply_due_on: null, replies: 0 },
      ] }
      return { ok: true, status: 200, json: async () => lists[url] ?? [] }
    }
    const body = JSON.parse(init.body as string)
    writes.push({ url, body })
    if (url === '/ai/v1/generate') return { ok: true, status: 200, json: async () => ({ request_id: 'r1', draft: AI_TEXT, provider: 'fake', model: 'fake-1', label: 'AI draft - check before use' }) }
    return { ok: true, status: 201, json: async () => ({ id: 'x' }) }
  }) as typeof fetch)
  render(<ScreenLangContext.Provider value="mr"><Notices firId="f1" fir={fir} /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'नोटिसा' })).toBeTruthy()
  const [one, two, three] = screen.getAllByRole('listitem').filter((li) => li.parentElement?.parentElement?.tagName === 'SECTION')
  expect(one.textContent).toContain('BNSS 94: कागदपत्रे किंवा डेटा सादर करा Nodal Officer, Fictional Bank यांना उत्तर अपूर्ण')
  expect(one.textContent).toMatch(/रोजी SI Fictional यांनी जारी · उत्तर 2026-10-12 पर्यंत · मजकूर AI ने मसुदा केला, अधिकाऱ्याने तपासला · 2 उत्तरे/)
  expect(within(one).getByText('Account statement: मिळाले')).toBeTruthy()
  expect(within(one).getByText('KYC documents: अजून मिळाले नाही')).toBeTruthy()
  expect(two.textContent).toMatch(/BNSS 179: साक्षीदार म्हणून हजर राहा .* यांना पाठवली, उत्तराची वाट · .* रोजी जारी · 1 उत्तर/)
  expect(three.textContent).toContain('a_new_kind Nodal Officer, Fictional Bank यांना मसुदा (स्वाक्षरी नाही)')   // an unknown kind shows its code
  expect(within(three).getByText('या नोटिसीवर स्वाक्षरी करून पाठवा')).toBeTruthy()
  const reply = within(two).getByText('उत्तर नोंदवा').closest('details')!
  expect(within(reply).getByRole('option', { name: 'हस्ते' })).toBeTruthy()
  type('मिळाले (तारीख आणि वेळ, IST)', '2026-10-11T15:00', within(reply))
  fireEvent.click(within(reply).getByLabelText('उत्तर नोटिसीला पूर्ण उत्तर देते'))
  fireEvent.click(within(reply).getByRole('button', { name: 'जतन करा' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body.checksJson).toBe('[{"item":"Reply answers the notice fully","present":true}]')   // stored in English
  fireEvent.click(screen.getByRole('button', { name: 'AI कडून मजकुराचा मसुदा करा' }))
  expect((await screen.findByRole('alert')).textContent).toBe('आधी “कोणाला” भरा.')
  type('कोणाला', 'Nodal Officer, Fictional Telecom')
  type(/सादर करायच्या गोष्टी/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'AI कडून मजकुराचा मसुदा करा' }))
  const box = await screen.findByRole('region', { name: 'AI मसुदा' })
  expect(writes[1].body.prompt).toContain('Write the text of a police notice: BNSS 94: produce documents or data.')
  fireEvent.click(within(box).getByRole('button', { name: 'हा मसुदा वापरा' }))
  expect(within(box).getByText('खालील मजकुरात कॉपी केले. जतन करण्यापूर्वी तपासा आणि दुरुस्त करा.')).toBeTruthy()
  type(/सादर करायच्या गोष्टी/, '')
  const write = screen.getByText('नोटीस लिहा').closest('details')!
  fireEvent.click(within(write).getByRole('button', { name: 'जतन करा' }))
  expect((await within(write).findByText('BNSS 94 नोटिसीत सादर करायच्या गोष्टी, प्रत्येक ओळीत एक, लिहिलेल्या असल्या पाहिजेत.')).getAttribute('role')).toBe('alert')
})

test('in Hindi an empty text is refused, and a decision that could not be logged is reported in Hindi', async () => {
  const writes = stubWithAi()
  render(<ScreenLangContext.Provider value="hi"><Notices firId="f1" fir={fir} /></ScreenLangContext.Provider>)
  await screen.findByText('अभी कुछ नहीं।')
  const write = screen.getByText('नोटिस लिखें').closest('details')!
  type('किसे', 'Nodal Officer, Fictional Telecom')
  fireEvent.change(within(write).getByLabelText(/^प्रकार/), { target: { value: 'BNSS_35_3' } })
  fireEvent.click(within(write).getByRole('button', { name: 'सहेजें' }))
  expect((await within(write).findByRole('alert')).textContent).toBe('नोटिस का पाठ लिखें।')
  fireEvent.click(screen.getByRole('button', { name: 'AI से पाठ का मसौदा बनाएँ' }))
  await screen.findByRole('region', { name: 'AI मसौदा' })
  vi.mocked(fetch).mockImplementation((async (url: string, init?: RequestInit) => {
    writes.push({ url, body: JSON.parse(init!.body as string) })
    return url === '/ai/v1/decisions' ? { ok: false, status: 503, json: async () => ({ detail: 'gateway down' }) } : { ok: true, status: 201, json: async () => ({ id: 'n5' }) }
  }) as typeof fetch)
  type('नोटिस का पाठ', 'Fictional notice text')
  fireEvent.click(within(write).getByRole('button', { name: 'सहेजें' }))
  expect(await screen.findByText('नोटिस सहेजा गया, पर AI मसौदे पर निर्णय दर्ज नहीं हो सका: The AI gateway answered 503: gateway down')).toBeTruthy()   // the gateway's own words stay as sent
})

/** Like stubWithAi, but the gateway can be made to refuse a draft or a decision. */
function stubFailingAi(fail: { generate?: boolean; decisions?: boolean }) {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  let n = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(init.body as string) })
      if (url === '/ai/v1/generate') {
        if (fail.generate) return { ok: false, status: 503, json: async () => ({ detail: 'The provider is not answering.' }) }
        n += 1
        return { ok: true, status: 200, json: async () => ({ request_id: `r${n}`, draft: `${AI_TEXT} v${n}`, provider: 'fake', model: 'fake-1', label: 'AI draft - check before use' }) }
      }
      if (url === '/ai/v1/decisions' && fail.decisions) return { ok: false, status: 503, json: async () => ({ detail: 'The audit log is not answering.' }) }
      return { ok: true, status: 201, json: async () => ({ id: 'n9' }) }
    }
    return { ok: true, status: 200, json: async () => [] }
  }))
  return writes
}

test('a gateway that refuses a draft shows why and leaves the form as it was', async () => {
  stubFailingAi({ generate: true })
  render(<Notices firId="f1" fir={fir} />)
  await screen.findByText('None yet.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type(/Items to produce/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  expect((await screen.findByText(/not answering/)).textContent).toContain('not answering')
  expect(screen.queryByRole('region', { name: 'AI draft' })).toBeNull()
})

test('a draft that cannot be logged as rejected stays on screen with the reason; a new draft replaces an unused one even if that log fails', async () => {
  const writes = stubFailingAi({ decisions: true })
  render(<Notices firId="f1" fir={fir} />)
  await screen.findByText('None yet.')
  type('To', 'Nodal Officer, Fictional Telecom')
  type(/Items to produce/, 'CDR')
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  const box = await screen.findByRole('region', { name: 'AI draft' })
  fireEvent.click(within(box).getByRole('button', { name: 'Discard' }))
  expect(await screen.findByText(/audit log is not answering/)).toBeTruthy()
  expect(screen.getByRole('region', { name: 'AI draft' })).toBeTruthy()   // not dropped: the refusal was not logged
  fireEvent.click(screen.getByRole('button', { name: 'Draft the text with AI' }))
  await vi.waitFor(() => expect(writes.filter((w) => w.url === '/ai/v1/generate')).toHaveLength(2))
  await vi.waitFor(() => expect(within(screen.getByRole('region', { name: 'AI draft' })).getByText(/v2/)).toBeTruthy())
  expect(writes.some((w) => w.body.note === 'replaced by a new draft')).toBe(true)
})

test('a notice with a status the screen does not know is still listed, with the status as written', async () => {
  stub({ '/firs/f1/notices': [{ ...sent, status: 'weird_status' }] })
  render(<Notices firId="f1" />)
  expect(await screen.findByText('weird_status')).toBeTruthy()
})

/** A sent notice is listed; the gateway answers `answer` (or fails with 503 when it is null); every write is recorded. */
function stubReply(answer: string | null, replyItems = sent) {
  const writes: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(init.body as string)
      writes.push({ url, body })
      if (url === '/ai/v1/generate') {
        return answer === null ? { ok: false, status: 503, json: async () => ({ detail: 'gateway down' }) } : { ok: true, status: 200, json: async () => ({ request_id: 'rr1', draft: answer }) }
      }
      return { ok: true, status: url.startsWith('/ai') ? 200 : 201, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => (url.endsWith('/notices') ? [replyItems] : []) }
  }))
  return writes
}
const open2 = { ...sent, items_missing: ['Account statement', 'KYC documents'] }
const REPLY_TEXT = 'The account statement for September is attached. KYC will follow.'
const reading = (items: unknown[]) => JSON.stringify(items)

test('A4: the reply reader pre-ticks what the reply brings, with its words; the officer changes a tick and the decision is logged as edited', async () => {
  const writes = stubReply(reading([
    { item: 'Account statement', present: true, quote: 'The account statement for September is attached' },
    { item: 'KYC documents', present: true, quote: 'KYC is enclosed' },   // words not in the reply: stays unticked
    { item: 'certificate', present: false, quote: '' },
  ]), open2)
  render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('Paste the text of the reply first.')
  type(/^Text of the reply/, REPLY_TEXT, within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  const box = await within(form).findByRole('region', { name: 'AI reading, check before saving' })
  expect(writes[0]).toMatchObject({ url: '/ai/v1/generate', body: { feature: 'reply_check', prompt_version: 'reply_check/reply@1', case_ref: 'f1' } })
  expect(within(box).getByText('Account statement: found in the reply')).toBeTruthy()
  expect(within(box).getByText('KYC documents: not found in the reply')).toBeTruthy()
  expect(within(box).getByText('BSA 63(4) certificate: not found in the reply')).toBeTruthy()
  expect((within(form).getByLabelText('Account statement') as HTMLInputElement).checked).toBe(true)
  expect((within(form).getByLabelText('KYC documents') as HTMLInputElement).checked).toBe(false)
  fireEvent.click(within(form).getByLabelText('KYC documents'))   // the officer saw the post note and ticks it by hand
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(writes[1]).toMatchObject({ url: '/api/firs/f1/notices/n1/replies', body: { checksJson: '[{"item":"Account statement","present":true},{"item":"KYC documents","present":true},{"item":"certificate","present":false}]', replyText: REPLY_TEXT } })
  expect(writes[2]).toEqual({ url: '/ai/v1/decisions', body: { request_id: 'rr1', decision: 'edited', feature: 'reply_check', case_ref: 'f1', note: '' } })
})

test('A4: the pasted reply is saved with the reply even on a protected case (no AI there); an empty box sends no text', async () => {
  const writes = stubReply('[]', open2)
  render(<Notices firId="f1" victimProtected />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, REPLY_TEXT, within(form))
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(1))
  expect(writes[0].body).toMatchObject({ replyText: REPLY_TEXT })
  await within(form).findByRole('button', { name: 'Save' })   // the form is free again after saving
  type(/^Text of the reply/, '   ', within(form))
  type(/^Received/, '2026-10-12T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1].body.replyText).toBeUndefined()
})

test('A4: ticks kept as the AI suggested are logged as accepted; a certificate found is shown with its words', async () => {
  const writes = stubReply(reading([
    { item: 'Account statement', present: true, quote: 'account statement for September is attached' },
    { item: 'KYC documents', present: false, quote: '' },
    { item: 'certificate', present: true, quote: 'KYC will follow' },
  ]), open2)
  render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, REPLY_TEXT, within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  expect(await within(form).findByText('BSA 63(4) certificate: found in the reply')).toBeTruthy()
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(writes[2].body).toMatchObject({ decision: 'accepted', feature: 'reply_check' })
  await vi.waitFor(() => expect((within(form).getByLabelText('Account statement') as HTMLInputElement).checked).toBe(false))   // form cleared after saving
  expect(within(form).queryByRole('region')).toBeNull()
})

test('A4: an unreadable answer, a gateway failure and a too long reply leave the boxes to the officer; no AI on a protected case or a notice without a list', async () => {
  stubReply('I cannot tell.', open2)
  const { unmount } = render(<Notices firId="f1" />)
  let form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, REPLY_TEXT, within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('The AI answer could not be read. Tick the items by hand.')
  unmount()
  stubReply(null, open2)
  const second = render(<Notices firId="f1" />)
  form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, REPLY_TEXT, within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('The AI gateway answered 503: gateway down')
  type(/^Text of the reply/, 'x'.repeat(30001), within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  expect((await within(form).findByRole('alert')).textContent).toBe('The reply text is too long for the AI. Tick the items by hand.')
  second.unmount()
  stubReply('[]', open2)
  const third = render(<Notices firId="f1" victimProtected />)
  form = (await screen.findByText('Log a reply')).closest('details')!
  expect(within(form).queryByRole('button', { name: 'Read the reply with AI' })).toBeNull()
  third.unmount()
  stubReply('[]', { ...sent, items_requested: [], items_missing: [] })
  render(<Notices firId="f1" />)
  form = (await screen.findByText('Log a reply')).closest('details')!
  expect(within(form).queryByRole('button', { name: 'Read the reply with AI' })).toBeNull()
})

const FIR_FACTS = { fir_no: 7, fir_year: 2026, sections: [{ act: 'BNS', section: '318(4)' }] }

test('A4: a reminder letter for the missing items is drafted from the numbered items only, edited, saved as a follow-up draft and logged as edited', async () => {
  const writes = stubReply('Kindly send the items below.', sent)
  render(<Notices firId="f1" fir={FIR_FACTS} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  const box = await screen.findByRole('region', { name: 'AI draft' })
  const asked = writes[0].body as { feature: string; prompt_version: string; prompt: string; case_ref: string }
  expect(asked).toMatchObject({ feature: 'notice_draft', prompt_version: 'notice_draft/reminder@1', case_ref: 'f1' })
  expect(asked.prompt).toContain('1. KYC documents')
  expect(asked.prompt).not.toContain('Account statement')   // already received: not asked again
  expect(asked.prompt).toContain('Addressed to: Nodal Officer, Fictional Bank')
  expect(asked.prompt).toContain('FIR No. 7/2026, registered under BNS 318(4)')
  type('Text of the notice', 'Kindly send the items below, today.', within(box))
  fireEvent.click(within(box).getByRole('button', { name: 'Save as a follow-up notice (draft)' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(writes[1]).toEqual({ url: '/api/firs/f1/notices', body: {
    kind: 'follow_up', addressee: 'Nodal Officer, Fictional Bank', itemsRequested: ['KYC documents'], body: 'Kindly send the items below, today.',
    aiRequestId: 'rr1', status: 'draft', issuedAt: null, replyDueOn: null } })
  expect(writes[2]).toEqual({ url: '/ai/v1/decisions', body: { request_id: 'rr1', decision: 'edited', feature: 'notice_draft', case_ref: 'f1', note: '' } })
  expect(screen.queryByRole('region', { name: 'AI draft' })).toBeNull()
})

test('A4: a reminder used unchanged is accepted; a discarded one is rejected and nothing is saved; a non-BNSS 94 notice leaves the addressee blank', async () => {
  const writes = stubReply('Kindly send the items below.', { ...sent, kind: 'follow_up' })
  render(<Notices firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  await screen.findByRole('region', { name: 'AI draft' })
  expect((writes[0].body as { prompt: string }).prompt).toContain('[ADDRESSEE NAME AND ADDRESS]')
  expect((writes[0].body as { prompt: string }).prompt).toContain('the FIR (number to be filled in by the officer)')
  expect((writes[0].body as { prompt: string }).prompt).not.toContain('Fictional Bank')
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  expect(writes[1]).toEqual({ url: '/ai/v1/decisions', body: { request_id: 'rr1', decision: 'rejected', feature: 'notice_draft', case_ref: 'f1', note: '' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  await screen.findByRole('region', { name: 'AI draft' })
  fireEvent.click(screen.getByRole('button', { name: 'Save as a follow-up notice (draft)' }))
  await vi.waitFor(() => expect(writes).toHaveLength(5))
  expect(writes[4].body).toMatchObject({ decision: 'accepted', feature: 'notice_draft' })
})

test('A4: no reminder on a protected case, for a complete notice or a draft; a gateway failure, a refused save and a failed log are shown or kept', async () => {
  stubReply('x', sent)
  const protectedCase = render(<Notices firId="f1" victimProtected />)
  await screen.findByText('Log a reply')
  expect(screen.queryByRole('button', { name: 'Draft a reminder letter with AI' })).toBeNull()
  protectedCase.unmount()
  stubReply('x', { ...sent, status: 'complete', items_missing: [] })
  const done = render(<Notices firId="f1" />)
  await screen.findByText('Account statement: received')
  expect(screen.queryByRole('button', { name: 'Draft a reminder letter with AI' })).toBeNull()
  done.unmount()
  stubReply(null, sent)
  const down = render(<Notices firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  expect((await screen.findByRole('alert')).textContent).toBe('The AI gateway answered 503: gateway down')
  down.unmount()
  // the save is refused: the draft stays and nothing is logged; then the decision cannot be logged: the saved follow-up is not saved twice
  const writes: string[] = []
  let refuse = true
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push(url)
      if (url === '/ai/v1/generate') return { ok: true, status: 200, json: async () => ({ request_id: 'rr1', draft: 'Kindly send.' }) }
      if (url === '/api/firs/f1/notices') return refuse ? { ok: false, status: 400, json: async () => ({ message: 'refused' }) } : { ok: true, status: 201, json: async () => ({}) }
      return { ok: false, status: 500, json: async () => ({ detail: 'log down' }) }
    }
    return { ok: true, status: 200, json: async () => (url.endsWith('/notices') ? [sent] : []) }
  }))
  render(<Notices firId="f1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save as a follow-up notice (draft)' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/refused/)
  expect(writes).toEqual(['/ai/v1/generate', '/api/firs/f1/notices'])
  refuse = false
  fireEvent.click(screen.getByRole('button', { name: 'Save as a follow-up notice (draft)' }))
  await vi.waitFor(() => expect(writes).toHaveLength(4))
  expect(screen.queryByRole('region', { name: 'AI draft' })).toBeNull()   // saved; the failed log did not bring the form back
  // an empty text cannot be saved, and a log that fails on discard keeps the draft on screen
  fireEvent.click(await screen.findByRole('button', { name: 'Draft a reminder letter with AI' }))
  const box = await screen.findByRole('region', { name: 'AI draft' })
  type('Text of the notice', '  ', within(box))
  expect((within(box).getByRole('button', { name: 'Save as a follow-up notice (draft)' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(within(box).getByRole('button', { name: 'Discard' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/log down/)
  expect(screen.getByRole('region', { name: 'AI draft' })).toBeTruthy()
})

test('A4: a BNSS 94 reply form asks whether a 63(4) certificate came; the reader pre-ticks it only with words from the reply, and a change is logged as edited', async () => {
  const writes = stubReply(reading([
    { item: 'Account statement', present: true, quote: 'The account statement for September is attached' },
    { item: 'KYC documents', present: false, quote: '' },
    { item: 'certificate', present: true, quote: 'Part A and Part B' },   // not in the reply text: stays unticked
  ]), open2)
  render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  const box = () => within(form).getByLabelText('A BSA 63(4) certificate (Part A and Part B) came with this reply') as HTMLInputElement
  expect(box().checked).toBe(false)
  type(/^Text of the reply/, REPLY_TEXT + ' Certificate: Part A and Part B signed.', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  await within(form).findByRole('region', { name: 'AI reading, check before saving' })
  expect(box().checked).toBe(true)
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(String(writes[1].body.checksJson)).toContain('{"item":"certificate","present":true}')
  expect(writes[2].body.decision).toBe('accepted')
})

test('A4: the officer unticks the certificate the reader found; no certificate box on a notice that is not BNSS 94', async () => {
  const writes = stubReply(reading([
    { item: 'Account statement', present: true, quote: 'The account statement for September is attached' },
    { item: 'KYC documents', present: false, quote: '' },
    { item: 'certificate', present: true, quote: 'certificate' },
  ]), open2)
  const { unmount } = render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, REPLY_TEXT + ' The certificate is enclosed.', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Read the reply with AI' }))
  await within(form).findByRole('region', { name: 'AI reading, check before saving' })
  fireEvent.click(within(form).getByLabelText('A BSA 63(4) certificate (Part A and Part B) came with this reply'))
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(writes).toHaveLength(3))
  expect(String(writes[1].body.checksJson)).toContain('{"item":"certificate","present":false}')
  expect(writes[2].body.decision).toBe('edited')
  unmount()
  stubReply('[]', { ...open2, kind: 'BNSS_179' })
  render(<Notices firId="f1" />)
  const other = (await screen.findByText('Log a reply')).closest('details')!
  expect(within(other).queryByLabelText('A BSA 63(4) certificate (Part A and Part B) came with this reply')).toBeNull()
})

/** The OCR route answers from `scans` in turn (an answer, or a status the gateway refused with); writes are recorded. */
function stubScan(scans: ({ text: string; pages: number } | number)[]) {
  const calls: { url: string; body: unknown }[] = []
  let n = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/ai/v1/read-scan')) {
      calls.push({ url, body: 'FILE' })
      const out = scans[n++]
      return typeof out === 'number'
        ? { ok: false, status: out, json: async () => ({ detail: 'the OCR program tesseract is not installed on this server' }) }
        : { ok: true, status: 200, json: async () => ({ request_id: `s${n}`, ...out }) }
    }
    if (init?.method && init.method !== 'GET') {
      calls.push({ url, body: JSON.parse(init.body as string) })
      return { ok: true, status: url.startsWith('/ai') ? 200 : 201, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => (url.endsWith('/notices') ? [open2] : []) }
  }))
  return calls
}
const pick = (form: HTMLElement, name = 'reply.pdf') =>
  fireEvent.change(within(form).getByLabelText(/Read a scan or photo/), { target: { files: [new File(['%PDF-'], name, { type: 'application/pdf' })] } })
const decisions = (calls: { url: string; body: unknown }[]) => calls.filter((c) => c.url === '/ai/v1/decisions').map((c) => c.body)

test('A4: a scanned reply is read on the state server into the box, corrected and saved; the decision is logged as edited', async () => {
  const calls = stubScan([{ text: 'Statement of acount enclosed.', pages: 2 }])
  render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  expect(within(form).getByText(/nothing is sent to a cloud service/)).toBeTruthy()
  fireEvent.change(within(form).getByLabelText(/Read a scan or photo/), { target: { files: [] } })   // nothing picked: nothing sent
  expect(calls).toHaveLength(0)
  pick(form)
  await within(form).findByText(/The text of 2 page\(s\) was read/)
  expect(calls[0].url).toBe('/ai/v1/read-scan?case_ref=f1')
  const box = within(form).getByLabelText(/^Text of the reply/) as HTMLTextAreaElement
  expect(box.value).toBe('Statement of acount enclosed.')
  type(/^Text of the reply/, 'Statement of account enclosed.', within(form))   // the officer corrects the OCR's mistake
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(decisions(calls)).toHaveLength(1))
  expect(calls.find((c) => c.url === '/api/firs/f1/notices/n1/replies')!.body).toMatchObject({ replyText: 'Statement of account enclosed.' })
  expect(decisions(calls)[0]).toEqual({ request_id: 's1', decision: 'edited', feature: 'reply_scan', case_ref: 'f1', note: 'scanned reply read and saved' })
})

test('A4: a scan kept as read is accepted; another file replaces it (rejected); discarding empties the box (rejected); all on a protected case too', async () => {
  const calls = stubScan([{ text: 'First file.', pages: 1 }, { text: 'Second file.', pages: 1 }, { text: 'Third file.', pages: 1 }])
  render(<Notices firId="f1" victimProtected />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  expect(within(form).queryByRole('button', { name: 'Read the reply with AI' })).toBeNull()   // the cloud reader is not offered here
  pick(form)
  await within(form).findByDisplayValue('First file.')
  pick(form, 'photo.jpg')
  await within(form).findByDisplayValue('Second file.')
  expect(decisions(calls)).toEqual([{ request_id: 's1', decision: 'rejected', feature: 'reply_scan', case_ref: 'f1', note: 'replaced by another file' }])
  fireEvent.click(within(form).getByRole('button', { name: 'Discard the text read' }))
  await vi.waitFor(() => expect(decisions(calls)).toHaveLength(2))
  expect(decisions(calls)[1]).toMatchObject({ request_id: 's2', decision: 'rejected' })
  expect((within(form).getByLabelText(/^Text of the reply/) as HTMLTextAreaElement).value).toBe('')
  pick(form)
  await within(form).findByDisplayValue('Third file.')
  type(/^Received/, '2026-10-11T15:00', within(form))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(decisions(calls)).toHaveLength(3))
  expect(decisions(calls)[2]).toMatchObject({ request_id: 's3', decision: 'accepted' })
})

test('A4: a refusal by the OCR shows why and leaves the box; a text longer than the box is cut and the officer told', async () => {
  const calls = stubScan([503, { text: 'x'.repeat(30005), pages: 40 }])
  render(<Notices firId="f1" />)
  const form = (await screen.findByText('Log a reply')).closest('details')!
  type(/^Text of the reply/, 'typed by hand', within(form))
  pick(form)
  expect((await within(form).findByRole('alert')).textContent).toContain('not installed on this server')
  expect((within(form).getByLabelText(/^Text of the reply/) as HTMLTextAreaElement).value).toBe('typed by hand')
  pick(form)
  expect((await within(form).findByRole('alert')).textContent).toBe('The text read was longer than the box holds; only its start is in the box.')
  expect((within(form).getByLabelText(/^Text of the reply/) as HTMLTextAreaElement).value).toHaveLength(30000)
  expect(decisions(calls)).toHaveLength(0)
})

test('an issued BNSS 94 notice is shown as a court-format paper and prints; a draft or another kind offers none', async () => {
  stub({ '/firs/f1/notices': [sent, { ...sent, id: 'n2', status: 'draft', issued_at: null }, { ...sent, id: 'n3', kind: 'BNSS_35_3', items_requested: [] },
    { ...sent, id: 'n4', reply_due_on: null, signed_by_name: null }] })
  const print = vi.fn()
  vi.stubGlobal('print', print)
  render(<Notices firId="f1" fir={fir} />)
  await screen.findAllByText('Account statement: received')
  const buttons = screen.getAllByRole('button', { name: 'Show the BNSS 94 notice as paper' })
  expect(buttons).toHaveLength(2) // n1 and n4 only
  fireEvent.click(buttons[0])
  const paper = screen.getByLabelText('BNSS 94 notice, paper copy')
  expect(paper.className).toBe('print-copy')
  expect(within(paper).getByText('Notice to produce documents or data (BNSS 94)')).toBeTruthy()
  expect(within(paper).getByText('FIR 214/2026 · BNS 318(4)')).toBeTruthy()
  expect(within(paper).getByText('To: Nodal Officer, Fictional Bank.')).toBeTruthy()
  expect(within(paper).getByText('KYC documents')).toBeTruthy()
  expect(within(paper).getByText('Reply to be given by: 2026-10-12.')).toBeTruthy()
  expect(within(paper).getByText('Name, rank and signature of the issuing officer: SI Fictional')).toBeTruthy()
  fireEvent.click(within(paper).getByRole('button', { name: 'Print the notice' }))
  expect(print).toHaveBeenCalled()
  // the other issued notice: no reply date line; and without the FIR facts no FIR line
  fireEvent.click(screen.getByRole('button', { name: 'Show the BNSS 94 notice as paper' }))
  expect(screen.queryByText(/Reply to be given by/)).toBeNull()
})
