import { useContext, useState } from 'react'
import { currentSession } from './api'
import { AiEvents, CaseExport, type CaseRef } from './AuditAi'
import { AiUseState } from './AiUse'
import { gapName } from './auditCsv'
import { fmt } from './formats'
import { ScreenLangContext, useT } from './i18n'
import { useLoad } from './useLoad'

type Station = { id: string; district: string; name: string }
type Entry = { kind: string; at: string; who_name: string; who_rank: string; what: string; reason: string | null; about: string | null; fir_id: string | null; fir_ref: string | null }

const PAGE = 100

/**
 * The audit log of one police station on one screen (board 20): reads of protected victim details, readiness gaps a
 * person accepted (and withdrew) with a reason, exports and the admin's changes, newest first, a page at a time; then the
 * AI's drafts and decisions on the station's cases (kept by the AI gateway) and the export of one case. The servers
 * decide who may see a station's log and answer with their own reason.
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
      <p className="lede">{t('audit.intro')}</p>
      <label>{t('common.policeStation')} <select value={station ?? ''} onChange={(e) => setChosen(e.target.value)}>
        {stations.data.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
      </select></label>
      {station ? <Station key={station} station={station} /> : <p>{t('audit.none')}</p>}
      <AiUseState />
    </>
  )
}

/** One station's log, the AI's entries on its cases and the export of one case; the cases are read once for both. */
function Station({ station }: { station: string }) {
  const t = useT()
  const cases = useLoad<CaseRef[]>(`/audit-log/cases?stationId=${station}`)
  const [exports, setExports] = useState(0)
  return (
    <>
      <Log key={exports} station={station} />
      {/* a refused station says why above; without its cases there is nothing to name the AI entries by */}
      {cases.data && <>
        <AiEvents station={station} cases={cases.data} />
        <CaseExport station={station} cases={cases.data} onDone={() => setExports((n) => n + 1)} />
      </>}
      {cases.error && <p role="status">{t('aiev.noCases', { error: cases.error })}</p>}
    </>
  )
}

function Log({ station }: { station: string }) {
  const t = useT()
  const lang = useContext(ScreenLangContext)
  const [offset, setOffset] = useState(0)
  const log = useLoad<Entry[]>(`/audit-log?stationId=${station}&limit=${PAGE}&offset=${offset}`)
  if (log.error) return <p role="alert">{log.error}</p>
  if (!log.data) return <p>{t('common.loading')}</p>
  const rows = log.data
  const what = (r: Entry) => r.kind === 'protected_read' ? t.code('reads.what', r.what)
    : r.kind === 'admin_action' ? t.code('admin.action', r.what) : r.kind === 'audit_export' ? t('audit.what.case')
    : r.kind.startsWith('override') ? gapName(lang, r.what, r.about) : r.what
  return (
    <>
      {rows.length === 0 ? <p>{t('audit.none')}</p> : (
        <table className="cards">
          <caption>{t('audit.caption')}</caption>
          <thead><tr><th scope="col">{t('reads.colWhen')}</th><th scope="col">{t('reads.colWho')}</th><th scope="col">{t('audit.colKind')}</th><th scope="col">{t('reads.colWhat')}</th><th scope="col">{t('audit.colReason')}</th><th scope="col">{t('reads.colCase')}</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.kind}-${r.at}-${i}`}>
              <td data-label={t('reads.colWhen')}>{fmt(r.at)}</td>
              <td data-label={t('reads.colWho')}>{r.who_name} ({r.who_rank})</td>
              <td data-label={t('audit.colKind')}>{t.code('audit.kind', r.kind)}</td>
              <td data-label={t('reads.colWhat')}>{what(r)}</td>
              <td data-label={t('audit.colReason')}>{r.reason}</td>
              <td data-label={t('reads.colCase')}>{r.fir_id && <a href={`#/firs/${r.fir_id}`}>{t('reads.fir', { ref: r.fir_ref ?? '' })}</a>}</td>
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
