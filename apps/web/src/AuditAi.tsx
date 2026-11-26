import { type FormEvent, useEffect, useState } from 'react'
import { ai, get, send } from './api'
import { auditCsv, type AiEntry, type ExportAnswer, type Person } from './auditCsv'
import { fmt, text } from './formats'
import { type Key, useT } from './i18n'

export type CaseRef = { id: string; kind: string; fir_id: string | null; ref: string | null }
type Event = AiEntry & { case_id: string }

const PAGE = 100
const MOST_PAGES = 50
const RESULTS: Record<string, { key: Key; chip: string }> = {
  asked: { key: 'aiev.asked', chip: 'c-ai' }, accepted: { key: 'aiuse.colKept', chip: 'c-ok' }, edited: { key: 'aiuse.colEdited', chip: 'c-info' },
  rejected: { key: 'aiuse.colRejected', chip: 'c-crit' }, refused: { key: 'aiuse.colRefused', chip: 'c-warn' }, failed: { key: 'aiuse.colFailed', chip: 'c-neu' },
}

/** The names of the officers the gateway's entries give by id, a few at a time (the web server limits a request's address). */
async function officers(station: string, events: AiEntry[]): Promise<Person[]> {
  const ids = [...new Set(events.map((e) => e.actor))]
  const out: Person[] = []
  for (let i = 0; i < ids.length; i += 50) out.push(...await get<Person[]>(`/audit-log/people?stationId=${station}&id=${ids.slice(i, i + 50).join('&id=')}`))
  return out
}

/** What the AI was asked on this station's cases and what a person decided, newest first (board 20). The AI gateway keeps
 *  these entries; it holds no question or answer text. */
export function AiEvents({ station, cases }: { station: string; cases: CaseRef[] }) {
  const t = useT()
  const [result, setResult] = useState('')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ key: string; events?: Event[]; people?: Person[]; error?: string }>({ key: '' })
  const key = `${offset}/${result}`
  useEffect(() => {
    let live = true
    ai<{ events: Event[] }>(`/v1/ai-events?station_id=${station}&limit=${PAGE}&offset=${offset}${result && `&result=${result}`}`)
      .then(async ({ events }) => ({ events, people: await officers(station, events) }))
      .then((p) => live && setPage({ key, ...p }), (e: Error) => live && setPage({ key, error: e.message }))
    return () => { live = false }
  }, [station, offset, result, key])
  const feature = (e: Event) => {
    const named = t.code('aiFeature', e.feature)
    if (named !== e.feature) return named
    const local = t.code('aiLocal', e.feature)
    return local !== e.feature ? local : e.label
  }
  const who = (id: string) => {
    const p = page.people?.find((x) => x.id === id)
    return p ? `${p.full_name} (${p.rank})` : t('aiev.unknownOfficer')
  }
  const caseLink = (id: string) => {
    const c = cases.find((x) => x.id === id)
    if (!c) return null
    return c.kind === 'complaint' ? <a href={`#/complaints/${c.id}`}>{t('reads.complaint')}</a> : <a href={`#/firs/${c.id}`}>{t('reads.fir', { ref: c.ref ?? '' })}</a>
  }
  const rows = page.key === key ? page.events : undefined
  return (
    <section>
      <h2>{t('aiev.title')}</h2>
      <p>{t('aiev.intro')}</p>
      <label>{t('aiev.show')} <select value={result} onChange={(e) => { setResult(e.target.value); setOffset(0) }}>
        <option value="">{t('aiev.all')}</option>
        {Object.entries(RESULTS).map(([code, r]) => <option key={code} value={code}>{t(r.key)}</option>)}
      </select></label>
      {page.key === key && page.error ? <p role="alert">{page.error}</p> : !rows ? <p>{t('common.loading')}</p> : rows.length === 0 ? <p>{t('aiev.none')}</p> : (
        <table className="cards">
          <caption>{t('aiev.caption')}</caption>
          <thead><tr>{([t('reads.colWhen'), t('reads.colWho'), t('aiuse.colFeature'), t('aiev.colResult'), t('aiev.colModel'), t('reads.colCase')]).map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.seq}>
              <td data-label={t('reads.colWhen')}>{fmt(e.at)}</td>
              <td data-label={t('reads.colWho')}>{who(e.actor)}</td>
              <td data-label={t('aiuse.colFeature')}>{feature(e)}</td>
              <td data-label={t('aiev.colResult')}>
                <span className={`chip ${RESULTS[e.result]?.chip ?? 'c-neu'}`}>{RESULTS[e.result] ? t(RESULTS[e.result].key) : e.result}</span>
                {e.question_refused && <> {t.code('aiev.question', e.question_refused)}</>}
              </td>
              <td data-label={t('aiev.colModel')}>{e.model}</td>
              <td data-label={t('reads.colCase')}>{caseLink(e.case_id)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {(offset > 0 || rows?.length === PAGE) && <p>
        {offset > 0 && <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('reads.newer')}</button>}{' '}
        {rows?.length === PAGE && <button type="button" onClick={() => setOffset(offset + PAGE)}>{t('reads.older')}</button>}
      </p>}
    </section>
  )
}

/** Every AI entry of one FIR, all pages. A file that would be cut short is not made. */
async function allAiEntries(station: string, firId: string): Promise<Event[]> {
  const out: Event[] = []
  for (let page = 0; page < MOST_PAGES; page++) {
    const { events } = await ai<{ events: Event[] }>(`/v1/ai-events?station_id=${station}&fir_id=${firId}&limit=200&offset=${page * 200}`)
    // a new entry between two pages pushes the last one onto the next page too
    out.push(...events.filter((e) => !out.some((o) => o.seq === e.seq)))
    if (events.length < 200) return out
  }
  throw new Error(`More than ${MOST_PAGES * 200} AI entries: the export was not made.`)
}

/** "Export for FIR" (board 20): one case's audit entries as a file, with which court or inquiry asked; the export is
 *  itself kept in the log. The AI's entries are read first, so a file without them is never made or logged. */
export function CaseExport({ station, cases, onDone }: { station: string; cases: CaseRef[]; onDone: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: string; saved?: string; withheld?: boolean }>({})
  const firs = cases.filter((c) => c.kind === 'fir')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firId = text(form, 'fir')
    const reason = text(form, 'reason')
    if (!firId || !reason) return
    setBusy(true); setMessage({})
    try {
      const entries = await allAiEntries(station, firId)
      const people = await officers(station, entries)
      const answer = (await send<ExportAnswer>('/audit-log/exports', 'POST', { firId, reason }))!
      const file = `audit-FIR-${answer.fir_ref.replace('/', '-')}.csv`
      const url = URL.createObjectURL(new Blob([auditCsv(answer, entries, people, new Date().toISOString())], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = file; a.click(); URL.revokeObjectURL(url)
      setMessage({ saved: file, withheld: answer.reasons_withheld })
      onDone()
    } catch (e) {
      setMessage({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  if (firs.length === 0) return null
  return (
    <section>
      <h2>{t('auditx.title')}</h2>
      <p>{t('auditx.intro')}</p>
      <form className="inline" onSubmit={save}>
        <label>{t('auditx.fir')} <select name="fir" required>{firs.map((c) => <option key={c.id} value={c.id}>{t('reads.fir', { ref: c.ref ?? '' })}</option>)}</select></label>{' '}
        <label>{t('auditx.reason')} <input name="reason" required minLength={10} maxLength={500} /></label>{' '}
        <button disabled={busy}>{t('auditx.download')}</button>
      </form>
      {message.error && <p role="alert">{message.error}</p>}
      {message.saved && <p role="status">{t('auditx.saved', { file: message.saved })}{message.withheld && ` ${t('auditx.withheld')}`}</p>}
    </section>
  )
}
