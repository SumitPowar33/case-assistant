import { useEffect, useState } from 'react'
import { ai } from './api'
import { useT } from './i18n'

type Row = { feature: string; label: string; asked: number; accepted: number; edited: number; rejected: number; refused: number; failed: number; embedded: number }

/** Reads the counts the AI gateway keeps in its audit log (it holds no question or answer text). */
function useUse(load: () => Promise<{ features: Row[] }>, key: string) {
  const [state, setState] = useState<{ rows?: Row[]; error?: string }>({})
  useEffect(() => {
    let live = true
    load().then((r) => live && setState({ rows: r.features }), (e: Error) => live && setState({ error: e.message }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

function Table({ rows }: { rows: Row[] }) {
  const t = useT()
  return (
    <table className="cards">
      <caption>{t('aiuse.caption')}</caption>
      <thead><tr>{(['colFeature', 'colAsked', 'colKept', 'colEdited', 'colRejected', 'colRefused', 'colFailed', 'colEmbedded'] as const).map((k) => <th key={k} scope="col">{t(`aiuse.${k}`)}</th>)}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.feature}>
          <td data-label={t('aiuse.colFeature')}>{r.label}</td>
          <td data-label={t('aiuse.colAsked')}>{r.asked}</td>
          <td data-label={t('aiuse.colKept')}>{r.accepted}</td>
          <td data-label={t('aiuse.colEdited')}>{r.edited}</td>
          <td data-label={t('aiuse.colRejected')}>{r.rejected}</td>
          <td data-label={t('aiuse.colRefused')}>{r.refused}</td>
          <td data-label={t('aiuse.colFailed')}>{r.failed}</td>
          <td data-label={t('aiuse.colEmbedded')}>{r.embedded}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

/** "AI use in this case" (A9): what the AI was asked for this FIR and what the officers did with it. Counts only. */
export function AiUseCase({ firId }: { firId: string }) {
  const t = useT()
  const use = useUse(() => ai<{ features: Row[] }>(`/v1/ai-use?case_ref=${firId}`), firId)
  return (
    <section>
      <h2>{t('aiuse.caseTitle')}</h2>
      <p>{t('aiuse.caseIntro')}</p>
      {use.error ? <p role="alert">{use.error}</p> : !use.rows ? <p>{t('common.loading')}</p> : use.rows.length === 0 ? <p>{t('aiuse.none')}</p> : <Table rows={use.rows} />}
    </section>
  )
}

const DAYS = 30

/** The same counts for the signed-in user's state over the last 30 days, on the audit log screen (board 20). */
export function AiUseState() {
  const t = useT()
  const use = useUse(() => ai<{ features: Row[] }>(`/v1/ai-use/summary?days=${DAYS}`), String(DAYS))
  return (
    <section>
      <h2>{t('aiuse.stateTitle', { days: DAYS })}</h2>
      {use.error ? <p role="alert">{use.error}</p> : !use.rows ? <p>{t('common.loading')}</p> : use.rows.length === 0 ? <p>{t('aiuse.stateNone', { days: DAYS })}</p> : <Table rows={use.rows} />}
    </section>
  )
}
