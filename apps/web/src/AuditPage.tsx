import { useState } from 'react'
import { currentSession } from './api'
import { CaseExport } from './AuditAi'
import type { CaseRef } from './auditAiData'
import AuditList from './AuditList'
import { AiUseState } from './AiUse'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Station = { id: string; district: string; name: string }

/**
 * The audit log of one police station on one screen (board 20): one filtered list of the reads of protected victim
 * details, the readiness gaps a person accepted (and withdrew) with a reason, record checks, exports, the admin's changes
 * and the AI's drafts and decisions on the station's cases, newest first; then the export of one case and the state's AI
 * counts. The servers decide who may see a station's log and answer with their own reason.
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

/** One station's list and the export of one case; the cases are read once for both. */
function Station({ station }: { station: string }) {
  const t = useT()
  const cases = useLoad<CaseRef[]>(`/audit-log/cases?stationId=${station}`)
  const [exports, setExports] = useState(0)
  return (
    <>
      <AuditList station={station} cases={cases.data ?? []} version={exports} />
      {/* a refused station says why above; without its cases there is nothing to choose an export from */}
      {cases.data && <CaseExport station={station} cases={cases.data} onDone={() => setExports((n) => n + 1)} />}
      {cases.error && <p role="status">{t('audit.noCases', { error: cases.error })}</p>}
    </>
  )
}
