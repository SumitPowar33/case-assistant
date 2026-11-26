import { useContext, useEffect, useState } from 'react'
import { ai, get } from './api'
import { officers, type AiEvent, type CaseRef } from './auditAiData'
import { gapName, newestFirst, type Person } from './auditCsv'
import { fmt } from './formats'
import { type Key, ScreenLangContext, useT } from './i18n'

type Entry = { kind: string; at: string; who_name: string; who_rank: string; what: string; reason: string | null; about: string | null; fir_id: string | null; fir_ref: string | null }
type Filter = { id: string; label: (t: ReturnType<typeof useT>) => string; kinds: string[] | null; ai: boolean }

const PAGE = 100
const kind = (code: string) => (t: ReturnType<typeof useT>) => t.code('audit.kind', code)
/** The board's filter chips. `kinds`: the application's entries asked for (empty: all of them; null: none). */
const FILTERS: Filter[] = [
  { id: 'all', label: (t) => t('aiev.all'), kinds: [], ai: true },
  { id: 'ai', label: (t) => t('audit.filter.ai'), kinds: null, ai: true },
  { id: 'victim', label: kind('protected_read'), kinds: ['protected_read'], ai: false },
  { id: 'override', label: kind('override'), kinds: ['override', 'override_withdrawn'], ai: false },
  { id: 'export', label: kind('audit_export'), kinds: ['audit_export'], ai: false },
  { id: 'search', label: (t) => t('audit.filter.searches'), kinds: ['involvement_search', 'cdr_read'], ai: false },
  { id: 'admin', label: kind('admin_action'), kinds: ['admin_action'], ai: false },
]
const CHIPS: Record<string, string> = { override: 'c-warn', admin_action: 'c-info' }
const RESULTS: Record<string, { key: Key; chip: string }> = {
  asked: { key: 'aiev.asked', chip: 'c-ai' }, accepted: { key: 'aiuse.colKept', chip: 'c-ok' }, edited: { key: 'aiuse.colEdited', chip: 'c-info' },
  rejected: { key: 'aiuse.colRejected', chip: 'c-crit' }, refused: { key: 'aiuse.colRefused', chip: 'c-warn' }, failed: { key: 'aiuse.colFailed', chip: 'c-neu' },
}

type Page = { key: string; app: Entry[]; events: AiEvent[]; people: Person[]; error?: string; aiError?: string }

/**
 * The station's log in one list (board 20), newest first, narrowed by a filter: the application's entries and the AI's
 * drafts and decisions on its cases (kept by the AI gateway, never any text). Each server pages its own entries; a page
 * here is the newest of both, and the next one starts in each where this one stopped. If the gateway cannot answer, the
 * screen says so and never shows the rest as if it were everything. `version` changes when the log has to be read again.
 */
export default function AuditList({ station, cases, version }: { station: string; cases: CaseRef[]; version: number }) {
  const t = useT()
  const lang = useContext(ScreenLangContext)
  const [filter, setFilter] = useState(FILTERS[0])
  const [result, setResult] = useState('')
  // where each page begins in the two lists; the last one is on the screen
  const [trail, setTrail] = useState([{ app: 0, ai: 0 }])
  const [page, setPage] = useState<Page>({ key: '', app: [], events: [], people: [] })
  const at = trail[trail.length - 1]
  const key = `${filter.id}/${result}/${at.app}/${at.ai}/${version}`
  useEffect(() => {
    let live = true
    const none = { events: [] as AiEvent[], people: [] as Person[], aiError: undefined as string | undefined }
    const app = filter.kinds
      ? get<Entry[]>(`/audit-log?stationId=${station}&limit=${PAGE}&offset=${at.app}${filter.kinds.map((k) => `&kind=${k}`).join('')}`)
      : Promise.resolve([] as Entry[])
    const gateway = !filter.ai ? Promise.resolve(none)
      : ai<{ events: AiEvent[] }>(`/v1/ai-events?station_id=${station}&limit=${PAGE}&offset=${at.ai}${result && `&result=${result}`}`)
        .then(async ({ events }) => ({ ...none, events, people: await officers(station, events) }))
        .catch((e: Error) => ({ ...none, aiError: e.message }))
    Promise.all([app, gateway]).then(([rows, g]) => live && setPage({ key, app: rows, ...g }),
      (e: Error) => live && setPage({ key, app: [], events: [], people: [], error: e.message }))
    return () => { live = false }
  }, [station, filter, result, at, key])

  const choose = (next: Filter, nextResult = '') => { setFilter(next); setResult(nextResult); setTrail([{ app: 0, ai: 0 }]) }
  const what = (r: Entry) => r.kind === 'protected_read' ? t.code('reads.what', r.what)
    : r.kind === 'admin_action' ? t.code('admin.action', r.what) : r.kind === 'audit_export' ? t('audit.what.case')
    : r.kind.startsWith('override') ? gapName(lang, r.what, r.about) : r.what
  const feature = (e: AiEvent) => {
    const named = t.code('aiFeature', e.feature)
    if (named !== e.feature) return named
    const local = t.code('aiLocal', e.feature)
    return local !== e.feature ? local : e.label
  }
  const who = (id: string) => {
    const p = page.people.find((x) => x.id === id)
    return p ? `${p.full_name} (${p.rank})` : t('aiev.unknownOfficer')
  }
  const caseLink = (id: string) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return null
    return c.kind === 'complaint' ? <a href={`#/complaints/${c.id}`}>{t('reads.complaint')}</a> : <a href={`#/firs/${c.id}`}>{t('reads.fir', { ref: c.ref ?? '' })}</a>
  }
  const shown = page.key === key
  const joined = newestFirst(page.app, page.events, PAGE)
  const more = joined.first < page.app.length || joined.second < page.events.length || page.app.length === PAGE || page.events.length === PAGE
  const columns = [t('reads.colWhen'), t('reads.colWho'), t('audit.colWhat'), t('aiev.colResult'), t('reads.colCase')]
  const [when, whoCol, whatCol, resultCol, caseCol] = columns
  return (
    <section>
      <div className="chips" role="group" aria-label={t('audit.filter')}>
        {FILTERS.map((f) => <button key={f.id} type="button" className={f.id === filter.id ? 'btn-p' : undefined} aria-pressed={f.id === filter.id} onClick={() => choose(f)}>{f.label(t)}</button>)}
      </div>
      {filter.id === 'ai' && <>
        <p>{t('aiev.intro')}</p>
        <label>{t('aiev.show')} <select value={result} onChange={(e) => choose(filter, e.target.value)}>
          <option value="">{t('aiev.all')}</option>
          {Object.entries(RESULTS).map(([code, r]) => <option key={code} value={code}>{t(r.key)}</option>)}
        </select></label>
      </>}
      {!shown ? <p>{t('common.loading')}</p> : page.error ? <p role="alert">{page.error}</p> : <>
        {page.aiError && <p role={filter.id === 'ai' ? 'alert' : 'status'}>{t('aiev.noCases', { error: page.aiError })}</p>}
        {joined.rows.length === 0 ? !page.aiError && <p>{filter.id === 'all' ? t('audit.none') : filter.id === 'ai' ? t('aiev.none') : t('audit.noneFiltered')}</p> : (
          <table className="cards">
            <caption>{t('audit.caption')}</caption>
            <thead><tr>{columns.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{joined.rows.map(({ app: r, ai: e }, i) => r ? (
              <tr key={`${r.kind}-${r.at}-${i}`}>
                <td data-label={when}>{fmt(r.at)}</td>
                <td data-label={whoCol}>{r.who_name} ({r.who_rank})</td>
                <td data-label={whatCol}>{what(r)}{r.reason && <><br />{t('audit.colReason')}: {r.reason}</>}</td>
                <td data-label={resultCol}><span className={`chip ${CHIPS[r.kind] ?? 'c-neu'}`}>{t.code('audit.kind', r.kind)}</span></td>
                <td data-label={caseCol}>{r.fir_id && <a href={`#/firs/${r.fir_id}`}>{t('reads.fir', { ref: r.fir_ref ?? '' })}</a>}</td>
              </tr>
            ) : (
              <tr key={`ai-${e.seq}`}>
                <td data-label={when}>{fmt(e.at)}</td>
                <td data-label={whoCol}>{who(e.actor)}</td>
                <td data-label={whatCol}><span className="chip c-ai">AI</span> {feature(e)}{e.model && <><br />{t('aiev.colModel')}: {e.model}</>}</td>
                <td data-label={resultCol}>
                  <span className={`chip ${RESULTS[e.result]?.chip ?? 'c-neu'}`}>{RESULTS[e.result] ? t(RESULTS[e.result].key) : e.result}</span>
                  {e.question_refused && <> {t.code('aiev.question', e.question_refused)}</>}
                </td>
                <td data-label={caseCol}>{caseLink(e.case_id)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {(trail.length > 1 || more) && <p>
          {trail.length > 1 && <button type="button" onClick={() => setTrail(trail.slice(0, -1))}>{t('reads.newer')}</button>}{' '}
          {more && <button type="button" onClick={() => setTrail([...trail, { app: at.app + joined.first, ai: at.ai + joined.second }])}>{t('reads.older')}</button>}
        </p>}
      </>}
    </section>
  )
}
