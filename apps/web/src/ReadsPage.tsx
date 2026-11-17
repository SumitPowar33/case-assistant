import { useState } from 'react'
import { currentSession } from './api'
import { fmt } from './formats'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Station = { id: string; district: string; name: string }
type Read = { id: string; at: string; what: string; fir_id: string | null; fir_ref: string | null; complaint_id: string | null; reader_name: string; reader_rank: string; reader_username: string | null }

const PAGE = 100

/**
 * Who read protected victim details at a police station (BNS 72): every time the real name, phone or address of a
 * protected victim, or the complaint text that names them, was shown. Newest first, a page at a time. The server decides
 * who may see a station's log (permission audit.read_protected) and answers with its own reason.
 */
export default function ReadsPage() {
  const t = useT()
  const stations = useLoad<Station[]>('/stations')
  const [chosen, setChosen] = useState<string>()
  if (stations.error) return <p role="alert">{stations.error}</p>
  if (!stations.data) return <p>{t('common.loading')}</p>
  const station = chosen ?? currentSession()?.user.station_id ?? stations.data[0]?.id
  return (
    <>
      <h1>{t('reads.title')}</h1>
      <p className="lede">{t('reads.intro')}</p>
      <label>{t('common.policeStation')} <select value={station ?? ''} onChange={(e) => setChosen(e.target.value)}>
        {stations.data.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
      </select></label>
      {station ? <Log key={station} station={station} /> : <p>{t('reads.none')}</p>}
    </>
  )
}

/** One station's log; a new station starts again on the newest page, without the rows of the one before. */
function Log({ station }: { station: string }) {
  const t = useT()
  const [offset, setOffset] = useState(0)
  const reads = useLoad<Read[]>(`/protected-reads?stationId=${station}&limit=${PAGE}&offset=${offset}`)
  if (reads.error) return <p role="alert">{reads.error}</p>
  if (!reads.data) return <p>{t('common.loading')}</p>
  const rows = reads.data
  return (
    <>
      {rows.length === 0 ? <p>{t('reads.none')}</p> : (
        <table>
          <caption>{t('reads.caption')}</caption>
          <thead><tr><th scope="col">{t('reads.colWhen')}</th><th scope="col">{t('reads.colWho')}</th><th scope="col">{t('reads.colWhat')}</th><th scope="col">{t('reads.colCase')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{fmt(r.at)}</td>
              <td>{r.reader_name} ({r.reader_rank}){r.reader_username && <> <small>{r.reader_username}</small></>}</td>
              <td>{t.code('reads.what', r.what)}</td>
              <td>{r.fir_id ? <a href={`#/firs/${r.fir_id}`}>{t('reads.fir', { ref: r.fir_ref ?? '' })}</a>
                : <a href={`#/complaints/${r.complaint_id}`}>{t('reads.complaint')}</a>}</td>
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
