import { useState } from 'react'
import { get } from './api'
import { fmt } from './formats'
import { useT } from './i18n'

type Head = { fir_no: number; fir_year: number; registered_at: string; station: string; district: string | null; state: string; io_name: string | null; io_rank: string | null
  sections: string; status: string | null; facts_text: string | null; evidence_text: string | null; approved_by: string | null; approved_rank: string | null
  signed_by: string | null; signed_rank: string | null; signed_at: string | null; report_no: string | null; court: string | null; filed_on: string | null }
type Person = { role: string; label: string | null; masked: boolean; name: string | null; parentage: string | null; age_years: number | null; gender: string | null
  address: string | null; arrested_at: string | null; first_remand_on: string | null; released_on: string | null; sent_up: boolean; has_statement: boolean }
type Item = { label: string; kind: string; description: string; seized_at: string; seal_no: string | null; sha256: string | null }
type Paper = { head: Head; people: Person[]; property: Item[] }

/**
 * The final report on paper for the court (GET /firs/{id}/final-report/print), in the order of the police form for a report
 * under BNSS 193, printed in the courts' format (index.css, "Printed papers": A4, Times New Roman 14 pt). Everything comes
 * from what is recorded; a protected victim is named only by label. Until the report is signed the paper says DRAFT.
 */
export default function CourtPaper({ firId }: { firId: string }) {
  const t = useT()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [error, setError] = useState('')

  async function open() {
    setError('')
    try {
      setPaper(await get<Paper>(`/firs/${firId}/final-report/print`))
      setTimeout(() => window.print(), 0)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const who = (p: Person) => (p.masked ? t('paper.masked', { label: p.label ?? '' }) : p.name ?? t('paper.unknown'))
  const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
  const h = paper?.head
  const sentUp = paper?.people.filter((p) => p.role === 'accused' && p.sent_up) ?? []
  const notSentUp = paper?.people.filter((p) => (p.role === 'accused' || p.role === 'suspect') && !p.sent_up) ?? []
  const informant = paper?.people.filter((p) => p.role === 'complainant' || (p.role === 'victim' && !paper.people.some((x) => x.role === 'complainant'))) ?? []
  const witnesses = paper?.people.filter((p) => p.role !== 'accused' && p.role !== 'suspect' && p.has_statement) ?? []
  return (
    <section aria-labelledby="paper-title">
      <h2 id="paper-title">{t('paper.title')}</h2>
      <p>{t('paper.lede')}</p>
      <button type="button" onClick={() => void open()}>{t('paper.print')}</button>
      {error && <p role="alert">{error}</p>}
      {h && paper && <article className="print-copy court-paper" aria-label={t('paper.heading')}>
        {h.status !== 'signed' && <p className="paper-draft">{t('paper.draft')}</p>}
        <h2>{t('paper.heading')}</h2>
        <p className="paper-sub">{t('paper.under')}</p>
        <p className="paper-court">{t('paper.court', { court: dash(h.court) })}</p>
        <ol className="paper-items">
          <li>{t('paper.district')} {dash(h.district)} · {t('paper.station')} {h.station} · {t('paper.year')} {h.fir_year} · {t('paper.firNo')} {h.fir_no} · {t('paper.date')} {fmt(h.registered_at)}</li>
          <li>{t('paper.reportNo')} {dash(h.report_no)} · {t('paper.date')} {dash(h.filed_on)}</li>
          <li>{t('paper.sections')} {dash(h.sections)}</li>
          <li>{t('paper.type')}</li>
          <li>{t('paper.io')} {dash(h.io_name)} ({dash(h.io_rank)})</li>
          <li>{t('paper.informant')} {informant.length ? informant.map((p) => `${who(p)}${p.parentage ? `, ${p.parentage}` : ''}`).join('; ') : '—'}</li>
          <li>{t('paper.property')}
            {paper.property.length ? <table><thead><tr><th>{t('paper.colNo')}</th><th>{t('paper.colDescription')}</th><th>{t('paper.colSeized')}</th><th>{t('paper.colSeal')}</th></tr></thead>
              <tbody>{paper.property.map((i) => <tr key={i.label}><td>{i.label}</td><td>{i.description}{i.sha256 ? ` (SHA-256 ${i.sha256})` : ''}</td><td>{fmt(i.seized_at)}</td><td>{dash(i.seal_no)}</td></tr>)}</tbody></table> : ' —'}</li>
          <li>{t('paper.sentUp')}
            {sentUp.length ? <table><thead><tr><th>{t('paper.colNo')}</th><th>{t('paper.colName')}</th><th>{t('paper.colParentage')}</th><th>{t('paper.colAgeSex')}</th><th>{t('paper.colAddress')}</th><th>{t('paper.colCustody')}</th></tr></thead>
              <tbody>{sentUp.map((p) => <tr key={p.label ?? p.name}><td>{dash(p.label)}</td><td>{who(p)}</td><td>{dash(p.parentage)}</td><td>{dash(p.age_years)} / {dash(p.gender)}</td><td>{dash(p.address)}</td>
                <td>{p.arrested_at ? t('paper.arrested', { date: fmt(p.arrested_at) }) : t('paper.notArrested')}{p.released_on ? `; ${t('paper.released', { date: p.released_on })}` : p.arrested_at ? `; ${t('paper.inCustody')}` : ''}</td></tr>)}</tbody></table> : ' —'}</li>
          <li>{t('paper.notSentUp')} {notSentUp.length ? notSentUp.map((p) => `${dash(p.label)} ${who(p)}`).join('; ') : '—'}</li>
          <li>{t('paper.witnesses')}
            {witnesses.length ? <table><thead><tr><th>{t('paper.colNo')}</th><th>{t('paper.colName')}</th><th>{t('paper.colParentage')}</th><th>{t('paper.colAgeSex')}</th><th>{t('paper.colAddress')}</th></tr></thead>
              <tbody>{witnesses.map((p) => <tr key={p.label ?? p.name}><td>{dash(p.label)}</td><td>{who(p)}</td><td>{dash(p.parentage)}</td><td>{dash(p.age_years)} / {dash(p.gender)}</td><td>{dash(p.address)}</td></tr>)}</tbody></table> : ' —'}</li>
          <li>{t('paper.facts')}<blockquote>{dash(h.facts_text)}</blockquote></li>
          <li>{t('paper.evidence')}<blockquote>{dash(h.evidence_text)}</blockquote></li>
        </ol>
        <div className="paper-signs">
          <p>{t('paper.forwarded')}<br />{h.approved_by ? `${h.approved_by} (${dash(h.approved_rank)})` : '—'}</p>
          <p>{t('paper.signedIo')}<br />{h.signed_by ? `${h.signed_by} (${dash(h.signed_rank)})${h.signed_at ? `, ${fmt(h.signed_at)}` : ''}` : '—'}</p>
        </div>
      </article>}
    </section>
  )
}
