import { useState } from 'react'
import { get } from './api'
import { fmt } from './formats'
import { useT } from './i18n'

type Record = { fir_id: string; fir_no: number; fir_year: number; registered_at: string; station: string; role: string; label: string | null;
  name: string | null; matched_on: ('phone' | 'name_parentage' | 'account')[]; can_open: boolean }

/**
 * Earlier records of an accused or suspect (InvolvementController): the other FIRs of the state where someone with the same
 * phone, the same name and parentage, or a linked account is an accused or suspect. Asked on purpose (each check is logged),
 * never by itself. Every line says what matched; it is not a finding that it is the same person.
 */
export default function EarlierRecords({ firId, personId, label }: { firId: string; personId: string; label: string }) {
  const t = useT()
  const [records, setRecords] = useState<Record[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function check() {
    setBusy(true)
    setError('')
    try {
      const out = await get<{ records: Record[]; truncated: boolean }>(`/firs/${firId}/people/${personId}/involvement`)
      setRecords(out.records)
      setTruncated(out.truncated)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="earlier">
      {!records && <button type="button" onClick={check} disabled={busy}>{t(busy ? 'earlier.checking' : 'earlier.check', { label })}</button>}
      {error && <p role="alert">{error}</p>}
      {records && <section aria-label={t('earlier.title', { label })}>
        <h3>{t('earlier.title', { label })}</h3>
        <p className="sub">{t('earlier.note')}</p>
        {records.length === 0 ? <p>{t('earlier.none')}</p> : <ul className="plain">{records.map((r) => (
          <li key={`${r.fir_id}-${r.label}`}>
            {r.can_open ? <a href={`#/firs/${r.fir_id}`}>{t('fir.title', { no: r.fir_no, year: r.fir_year })}</a> : <strong>{t('fir.title', { no: r.fir_no, year: r.fir_year })}</strong>}
            {' · '}{r.station} · {fmt(r.registered_at)}
            <div className="sub">{r.label} ({t.code('person', r.role)}): {r.name ?? '—'}</div>
            <div>{r.matched_on.map((m) => <span key={m} className="chip c-info">{t.code('earlier.match', m)}</span>)}</div>
          </li>
        ))}</ul>}
        {truncated && <p>{t('earlier.truncated')}</p>}
      </section>}
    </div>
  )
}
