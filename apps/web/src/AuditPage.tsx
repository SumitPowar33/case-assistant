import { useState } from 'react'
import { currentSession } from './api'
import { fmt } from './formats'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Station = { id: string; district: string; name: string }
type Entry = { kind: string; at: string; who_name: string; who_rank: string; what: string; reason: string | null; fir_id: string | null; fir_ref: string | null }

const PAGE = 100

/**
 * The audit log of one police station on one screen (board 20): reads of protected victim details, readiness gaps a
 * person accepted (and withdrew) with a reason, and the admin's changes. Newest first, a page at a time. The server
 * decides who may see a station's log and answers with its own reason.
 */
export default function AuditPage() {
  const t = useT()
  const stations = useLoad<Station[]>('/stations')
  const [chosen, setChosen] = useState<string>()
  if (stations.error) return <p role="alert">{stations.error}</p>
  if (!stations.data) return <p>{t('common.loading')}</p>
  const station = chosen ?? currentSession()?.user.station_id ?? stations.data[0]?.id
  return (
    <>
      <h1>{t('audit.title')}</h1>
      <p>{t('audit.intro')}</p>
      <label>{t('common.policeStation')} <select value={station ?? ''} onChange={(e) => setChosen(e.target.value)}>
        {stations.data.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
      </select></label>
      {station ? <Log key={station} station={station} /> : <p>{t('audit.none')}</p>}
    </>
  )
}

function Log({ station }: { station: string }) {
  const t = useT()
  const [offset, setOffset] = useState(0)
  const log = useLoad<Entry[]>(`/audit-log?stationId=${station}&limit=${PAGE}&offset=${offset}`)
  if (log.error) return <p role="alert">{log.error}</p>
  if (!log.data) return <p>{t('common.loading')}</p>
  const rows = log.data
  return (
    <>
      {rows.length === 0 ? <p>{t('audit.none')}</p> : (
        <table>
          <caption>{t('audit.caption')}</caption>
          <thead><tr><th scope="col">{t('reads.colWhen')}</th><th scope="col">{t('reads.colWho')}</th><th scope="col">{t('audit.colKind')}</th><th scope="col">{t('reads.colWhat')}</th><th scope="col">{t('audit.colReason')}</th><th scope="col">{t('reads.colCase')}</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.kind}-${r.at}-${i}`}>
              <td>{fmt(r.at)}</td>
              <td>{r.who_name} ({r.who_rank})</td>
              <td>{t.code('audit.kind', r.kind)}</td>
              <td>{r.kind === 'protected_read' ? t.code('reads.what', r.what) : r.what}</td>
              <td>{r.reason}</td>
              <td>{r.fir_id && <a href={`#/firs/${r.fir_id}`}>{t('reads.fir', { ref: r.fir_ref ?? '' })}</a>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {(offset > 0 || rows.length === PAGE) && <p>
        {offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('reads.newer')}</button>}{' '}
        {rows.length === PAGE && <button type="button" onClick={() => setOffset(offset + PAGE)}>{t('reads.older')}</button>}
      </p>}
    </>
  )
}
