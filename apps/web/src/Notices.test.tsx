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
    aiRequestId: null, status: 'sent', issuedAt: '2026-10-05T10:00:00+05:30', replyDueOn: '2026-10-12' })
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
  expect(writes[0].body).toMatchObject({ feature: 'notice_draft', prompt_version: 'notice_draft/notice@1', case_ref: 'f1' })
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
  expect(one.textContent).toContain('BNSS 94: कागदपत्रे किंवा डेटा सादर करा Nodal Officer, Fictional Bank यांना: उत्तर अपूर्ण')
  expect(one.textContent).toMatch(/रोजी SI Fictional यांनी जारी · उत्तर 2026-10-12 पर्यंत · मजकूर AI ने मसुदा केला, अधिकाऱ्याने तपासला · 2 उत्तरे/)
  expect(within(one).getByText('Account statement: मिळाले')).toBeTruthy()
  expect(within(one).getByText('KYC documents: अजून मिळाले नाही')).toBeTruthy()
  expect(two.textContent).toMatch(/BNSS 179: साक्षीदार म्हणून हजर राहा .* यांना: पाठवली, उत्तराची वाट · .* रोजी जारी · 1 उत्तर/)
  expect(three.textContent).toContain('a_new_kind Nodal Officer, Fictional Bank यांना: मसुदा (स्वाक्षरी नाही)')   // an unknown kind shows its code
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
