import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Certificate = {
  id: string; part: 'A' | 'B'; signer_name: string; device_type: string; device_ids: string | null; hash_algo: string; hash_value: string
  signed_at: string; place: string; supersedes: string | null; correction_reason: string | null; replaced_by: string | null
}
const PART = { A: 'cert.partA', B: 'cert.partB' } as const

/** One certificate as paper (court format of docs/DESIGN.md "Printed papers"): numbered paragraphs, then the signature line. */
function CertificatePaper({ c, label }: { c: Certificate; label: string }) {
  const t = useT()
  return (
    <section className="print-copy" aria-label={t('certp.label')}>
      <h3>{t('certp.title')}</h3>
      <p>{t(PART[c.part])}</p>
      <ol>
        <li>{t('certp.item', { label })}</li>
        <li>{t('certp.by', { name: c.signer_name })}</li>
        <li>{t('certp.device', { device: c.device_type, ids: c.device_ids ? ` (${c.device_ids})` : '' })}</li>
        <li>{t('certp.hash', { algo: c.hash_algo, hash: c.hash_value })}</li>
        <li>{t('certp.when', { date: fmt(c.signed_at), place: c.place })}</li>
        {c.correction_reason && <li>{t('cert.correction', { reason: c.correction_reason })}</li>}
      </ol>
      <p>{t('certp.sign')}</p>
      <button type="button" className="no-print" onClick={() => window.print()}>{t('certp.print')}</button>
    </section>
  )
}

/**
 * BSA 63(4) certificates of one electronic item. A signed certificate is never edited: a mistake is fixed by a new
 * certificate that names the one it replaces and says why (the server keeps both).
 */
export default function Certificates({ firId, item, onSaved }: { firId: string; item: { id: string; label: string; sha256: string | null }; onSaved: () => void }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [paperOf, setPaperOf] = useState<string>()
  const { data, error } = useLoad<Certificate[]>(`/firs/${firId}/evidence/${item.id}/certificates`, version)
  const current = (data ?? []).filter((c) => !c.replaced_by)
  return (
    <div>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('cert.none')}</p> : (
        <ul>{data.map((c) => (
          <li key={c.id}>
            {t('cert.line', { part: t(PART[c.part]), name: c.signer_name, device: c.device_type, ids: c.device_ids ? ` (${c.device_ids})` : '', date: fmt(c.signed_at), place: c.place })}
            {' '}{c.hash_algo} {t(c.hash_algo === 'SHA256' && item.sha256 && c.hash_value.toLowerCase() === item.sha256 ? 'cert.matches' : 'cert.noMatch')}
            {c.correction_reason && <> · {t('cert.correction', { reason: c.correction_reason })}</>}
            {c.replaced_by && <> · <em>{t('cert.replaced')}</em></>}
            {!c.replaced_by && (paperOf === c.id
              ? <CertificatePaper c={c} label={item.label} />
              : <> · <button type="button" onClick={() => setPaperOf(c.id)}>{t('certp.show')}</button></>)}
          </li>
        ))}</ul>
      )}
      <Form title={t('cert.add', { label: item.label })} onSaved={() => { setVersion((v) => v + 1); onSaved() }}
        submit={(f) => {
          const algo = String(f.get('algo')), hash = text(f, 'hash') ?? ''
          if (algo === 'SHA256' && !/^[0-9a-fA-F]{64}$/.test(hash)) throw new Error(t('cert.badSha'))
          const supersedes = text(f, 'supersedes')
          const replaced = current.find((c) => c.id === supersedes)
          if (replaced && replaced.part !== f.get('part')) throw new Error(t('cert.samePart'))
          if (supersedes && (text(f, 'reason') ?? '').length < 10) throw new Error(t('cert.needReason'))
          return send(`/firs/${firId}/evidence/${item.id}/certificates`, 'POST', {
            part: f.get('part'), signerName: text(f, 'signer'), deviceType: text(f, 'device'), deviceIds: text(f, 'ids'),
            hashAlgo: algo, hashValue: hash, signedAt: istIso(String(f.get('signed'))), place: text(f, 'place'),
            supersedes, correctionReason: supersedes ? text(f, 'reason') : null,
          })
        }}>
        <label>{t('cert.part')} <select name="part"><option value="A">{t(PART.A)}</option><option value="B">{t(PART.B)}</option></select></label>
        <label>{t('cert.signer')} <input name="signer" required /></label>
        <label>{t('cert.device')} <input name="device" placeholder={t('cert.devicePh')} required /></label>
        <label>{t('cert.ids')} <input name="ids" placeholder={t('cert.idsPh')} /></label>
        <label>{t('cert.algo')} <select name="algo"><option value="SHA256">SHA-256</option><option value="SHA1">SHA-1</option><option value="MD5">MD5</option><option value="Other">{t('cert.other')}</option></select></label>
        <label>{t('cert.hash')} <input name="hash" spellCheck={false} required /></label>
        <label>{t('cert.signed')} <input name="signed" type="datetime-local" required /></label>
        <label>{t('cert.place')} <input name="place" required /></label>
        {current.length > 0 && <>
          <label>{t('cert.corrects')} <select name="supersedes" defaultValue="">
            <option value="">{t('cert.new')}</option>
            {current.map((c) => <option key={c.id} value={c.id}>{t('cert.replaces', { cert: t('cert.short', { part: c.part, name: c.signer_name, date: fmt(c.signed_at) }) })}</option>)}
          </select></label>
          <label>{t('cert.reason')} <input name="reason" /></label>
        </>}
      </Form>
    </div>
  )
}
