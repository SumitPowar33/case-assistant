import { useLoad } from './useLoad'
import { useT } from './i18n'

type Link = { fact_id: string; kind: string; value: string; firs: { id: string; fir_no: number; fir_year: number }[]; others: number }

/**
 * Numbers of this FIR seen in other FIRs of its station (design board 2, "these numbers also appear in FIR 198/2026",
 * A1, V65): its confirmed phone, account, UTR and UPI facts compared with the other FIRs' confirmed facts by the core
 * (GET /firs/{id}/facts/links). A case the officer is on the team of opens by its number; others are only counted. It
 * links facts, it says nothing about who did what: the officer reads both files and decides. Shown only when there is a link.
 */
export default function FactLinks({ firId, version }: { firId: string; version: number }) {
  const t = useT()
  const { data } = useLoad<Link[]>(`/firs/${firId}/facts/links`, version)
  if (!Array.isArray(data) || !data.length) return null
  return (
    <div className="card" aria-labelledby="fact-links-title">
      <h3 id="fact-links-title">{t('facts.links.title')}</h3>
      <ul className="plain">{data.map((l) => (
        <li key={l.fact_id}>
          <span className="chip c-warn">{t.code('facts.kind', l.kind)}</span> <strong>{l.value}</strong>{' '}
          {l.firs.length > 0 && <>{t('facts.links.alsoIn')} {l.firs.map((f, i) => (
            <span key={f.id}>{i > 0 && ', '}<a href={`#/firs/${f.id}`}>{t('facts.links.fir', { no: f.fir_no, year: f.fir_year })}</a></span>
          ))}</>}
          {l.others > 0 && <> <small>{t('facts.links.others', { n: l.others })}</small></>}
        </li>
      ))}</ul>
      <p><small>{t('facts.links.note')}</small></p>
    </div>
  )
}
