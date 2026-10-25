import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'

type Certificate = {
  id: string; part: 'A' | 'B'; signer_name: string; device_type: string; device_ids: string | null; hash_algo: string; hash_value: string
  signed_at: string; place: string; supersedes: string | null; correction_reason: string | null; replaced_by: string | null
}
const PART = { A: 'Part A (person in charge of the device)', B: 'Part B (expert)' }
const short = (c: Certificate) => `${c.part} by ${c.signer_name}, ${fmt(c.signed_at)}`

/**
 * BSA 63(4) certificates of one electronic item. A signed certificate is never edited: a mistake is fixed by a new
 * certificate that names the one it replaces and says why (the server keeps both).
 */
export default function Certificates({ firId, item, onSaved }: { firId: string; item: { id: string; label: string; sha256: string | null }; onSaved: () => void }) {
  const [version, setVersion] = useState(0)
  const { data, error } = useLoad<Certificate[]>(`/firs/${firId}/evidence/${item.id}/certificates`, version)
  const current = (data ?? []).filter((c) => !c.replaced_by)
  return (
    <div>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : !data.length ? <p>No 63(4) certificate yet.</p> : (
        <ul>{data.map((c) => (
          <li key={c.id}>
            {PART[c.part]}: {c.signer_name}, {c.device_type}{c.device_ids && ` (${c.device_ids})`}, signed {fmt(c.signed_at)} at {c.place}.
            {' '}{c.hash_algo} {c.hash_algo === 'SHA256' && item.sha256 && c.hash_value.toLowerCase() === item.sha256 ? 'matches the seizure hash' : 'does not match the seizure hash'}
            {c.correction_reason && <> · correction: {c.correction_reason}</>}
            {c.replaced_by && <> · <em>replaced by a correction</em></>}
          </li>
        ))}</ul>
      )}
      <Form title={`Add a 63(4) certificate for ${item.label}`} onSaved={() => { setVersion((v) => v + 1); onSaved() }}
        submit={(f) => {
          const algo = String(f.get('algo')), hash = text(f, 'hash') ?? ''
          if (algo === 'SHA256' && !/^[0-9a-fA-F]{64}$/.test(hash)) throw new Error('A SHA-256 hash has 64 characters (0-9, a-f).')
          const supersedes = text(f, 'supersedes')
          const replaced = current.find((c) => c.id === supersedes)
          if (replaced && replaced.part !== f.get('part')) throw new Error('A correction must be for the same part as the certificate it replaces.')
          if (supersedes && (text(f, 'reason') ?? '').length < 10) throw new Error('Say why the certificate is corrected (at least 10 characters).')
          return send(`/firs/${firId}/evidence/${item.id}/certificates`, 'POST', {
            part: f.get('part'), signerName: text(f, 'signer'), deviceType: text(f, 'device'), deviceIds: text(f, 'ids'),
            hashAlgo: algo, hashValue: hash, signedAt: istIso(String(f.get('signed'))), place: text(f, 'place'),
            supersedes, correctionReason: supersedes ? text(f, 'reason') : null,
          })
        }}>
        <label>Part <select name="part"><option value="A">{PART.A}</option><option value="B">{PART.B}</option></select></label>
        <label>Signed by <input name="signer" required /></label>
        <label>Device type <input name="device" placeholder="mobile phone, laptop, server log" required /></label>
        <label>Device identifiers <input name="ids" placeholder="make, model, serial, IMEI" /></label>
        <label>Hash type <select name="algo"><option value="SHA256">SHA-256</option><option value="SHA1">SHA-1</option><option value="MD5">MD5</option><option value="Other">Other</option></select></label>
        <label>Hash as written on the certificate <input name="hash" spellCheck={false} required /></label>
        <label>Signed (date and time, IST) <input name="signed" type="datetime-local" required /></label>
        <label>Place <input name="place" required /></label>
        {current.length > 0 && <>
          <label>Corrects an earlier certificate? <select name="supersedes" defaultValue="">
            <option value="">No, a new certificate</option>
            {current.map((c) => <option key={c.id} value={c.id}>Replaces {short(c)}</option>)}
          </select></label>
          <label>Reason for the correction <input name="reason" /></label>
        </>}
      </Form>
    </div>
  )
}
