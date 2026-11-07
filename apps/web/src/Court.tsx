import { istToday } from './formats'
import { useState } from 'react'
import { send } from './api'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type CaseRow = {
  fir_id: string; fir_no: number; fir_year: number; station: string; court: string | null; case_no: string | null
  next_date: string | null; events: number; summons_open: number
}
type List = { cases: CaseRow[]; counts: Record<string, number> }
type Event = { id: string; kind: string; on_date: string; court: string | null; case_no: string | null; note: string | null }
type Summons = { id: string; witness: string; role: string | null; status: string; on_date: string; note: string | null }
type One = { events: Event[]; summons: Summons[] }

const KINDS = ['chargesheet_filed', 'cognizance', 'copies_given', 'charge_framing', 'prosecution_evidence', 'arguments', 'judgment', 'other'] as const
const SUMMONS = ['sent', 'served', 'not_served', 'appeared', 'excused'] as const
const SUMMONS_CHIP: Record<string, string> = { sent: 'c-neu', served: 'c-info', not_served: 'c-warn', appeared: 'c-ok', excused: 'c-neu' }
const today = () => istToday()

/** One case in court: the timeline of dates (past and coming), the witnesses' summons, and the two forms (rows are kept, V45). */
function Case({ row, onSaved }: { row: CaseRow; onSaved: () => void }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<One>(`/firs/${row.fir_id}/court`, version)
  async function run(e: React.FormEvent<HTMLFormElement>, action: (v: (k: string) => string) => Promise<unknown>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    try {
      await action((k) => String(f.get(k) ?? '').trim())
      form.reset()
      setVersion((n) => n + 1)
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  const events = Array.isArray(data?.events) ? data.events : []
  const summons = Array.isArray(data?.summons) ? data.summons : []
  return (
    <section aria-labelledby="court-case">
      <h2 id="court-case">{t('court.caseTitle', { no: row.fir_no, year: row.fir_year })}</h2>
      <p><a href={`#/firs/${row.fir_id}`}>{t('prop.openCase', { no: row.fir_no, year: row.fir_year })}</a></p>
      {loadError ? <p role="alert">{loadError}</p> : (
        <>
          <div className="table-scroll"><table>
            <caption>{t('court.timeline')}</caption>
            <thead><tr><th scope="col">{t('prop.colWhen')}</th><th scope="col">{t('court.colStep')}</th><th scope="col">{t('exp.colNote')}</th></tr></thead>
            <tbody>{events.map((ev) => (
              <tr key={ev.id}><td>{ev.on_date}</td><td>{t.code('courtKind', ev.kind)}{ev.court && <div className="sub">{ev.court}{ev.case_no ? ` · ${ev.case_no}` : ''}</div>}</td><td>{ev.note ?? ''}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="table-scroll"><table>
            <caption>{t('court.summonsTitle')}</caption>
            <thead><tr><th scope="col">{t('court.colWitness')}</th><th scope="col">{t('prop.colStatus')}</th><th scope="col">{t('prop.colWhen')}</th></tr></thead>
            <tbody>{summons.map((s) => (
              <tr key={s.id}>
                <td>{s.witness}{s.role && <div className="sub">{s.role}</div>}</td>
                <td><span className={`chip ${SUMMONS_CHIP[s.status] ?? 'c-neu'}`}>{t.code('courtSummons', s.status)}</span>{s.note && <div className="sub">{s.note}</div>}</td>
                <td>{s.on_date}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <form className="record-form" onSubmit={(e) => void run(e, (v) => send(`/firs/${row.fir_id}/court-events`, 'POST', { kind: v('kind'), date: v('date'), court: v('court'), caseNo: v('caseNo'), note: v('note') }))}>
        <h3>{t('court.addDate')}</h3>
        <label>{t('court.colStep')} <select name="kind" defaultValue="charge_framing">{KINDS.map((k) => <option key={k} value={k}>{t.code('courtKind', k)}</option>)}</select></label>
        <label>{t('exp.date')} <input name="date" type="date" required defaultValue={today()} /></label>
        <label>{t('court.court')} <input name="court" maxLength={160} /></label>
        <label>{t('court.caseNo')} <input name="caseNo" maxLength={60} /></label>
        <label>{t('exp.note')} <input name="note" maxLength={500} /></label>
        <button type="submit">{t('court.saveDate')}</button>
      </form>
      <form className="record-form" onSubmit={(e) => void run(e, (v) => send(`/firs/${row.fir_id}/court-summons`, 'POST', { witness: v('witness'), role: v('role'), status: v('status'), date: v('date'), note: v('note') }))}>
        <h3>{t('court.addSummons')}</h3>
        <label>{t('court.colWitness')} <input name="witness" required minLength={2} maxLength={160} /></label>
        <label>{t('court.role')} <input name="role" maxLength={100} /></label>
        <label>{t('prop.colStatus')} <select name="status" defaultValue="sent">{SUMMONS.map((s) => <option key={s} value={s}>{t.code('courtSummons', s)}</option>)}</select></label>
        <label>{t('exp.date')} <input name="date" type="date" required defaultValue={today()} max={today()} /></label>
        <label>{t('exp.note')} <input name="note" maxLength={500} /></label>
        <button type="submit">{t('court.saveSummons')}</button>
      </form>
    </section>
  )
}

/** Starts the court record of one of the person's cases with its first date (the newest 100 cases are offered). */
function FirstDate({ onSaved }: { onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  const { data } = useLoad<{ id: string; fir_no: number; fir_year: number }[]>('/firs?limit=100&offset=0')
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    try {
      await send(`/firs/${v('fir')}/court-events`, 'POST', { kind: v('kind'), date: v('date'), court: v('court'), caseNo: v('caseNo'), note: '' })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  const firs = Array.isArray(data) ? data : []
  return (
    <form className="record-form" onSubmit={(e) => void save(e)}>
      <h2>{t('court.newTitle')}</h2>
      {error && <p role="alert">{error}</p>}
      <label>{t('prop.colCase')} <select name="fir" required defaultValue="">
        <option value="" disabled>{t('exp.noCase')}</option>
        {firs.map((f) => <option key={f.id} value={f.id}>{t('fir.title', { no: f.fir_no, year: f.fir_year })}</option>)}
      </select></label>
      <label>{t('court.colStep')} <select name="kind" defaultValue="chargesheet_filed">{KINDS.map((k) => <option key={k} value={k}>{t.code('courtKind', k)}</option>)}</select></label>
      <label>{t('exp.date')} <input name="date" type="date" required defaultValue={today()} /></label>
      <label>{t('court.court')} <input name="court" maxLength={160} /></label>
      <label>{t('court.caseNo')} <input name="caseNo" maxLength={60} /></label>
      <button type="submit">{t('court.saveDate')}</button>
    </form>
  )
}

/**
 * Court and trial tracker (design board 12): the cases of the person that have court dates, the next date of each, the
 * witnesses whose summons is not yet served, and a case's timeline. The board's ICJS feed and AI prosecutor brief are
 * not built; the update to the victim stays on the FIR's own part.
 */
export default function Court() {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const { data, error } = useLoad<List>('/court', version)
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  const cases = Array.isArray(data.cases) ? data.cases : []
  const row = cases.find((c) => c.fir_id === picked)
  return (
    <>
      <h1>{t('court.title')}</h1>
      <p className="lede">{t('court.intro')}</p>
      <p>
        <span className="chip c-info">{t('court.countComing', { n: data.counts?.coming ?? 0 })}</span>{' '}
        <span className="chip c-neu">{t('court.countNoDate', { n: data.counts?.no_date ?? 0 })}</span>
      </p>
      {cases.length === 0 ? <p>{t('common.noneYet')}</p> : (
        <div className="table-scroll"><table>
          <caption>{t('court.caption')}</caption>
          <thead><tr>{(['prop.colCase', 'court.court', 'court.colNext', 'court.colSummons'] as const).map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
          <tbody>{cases.map((c) => (
            <tr key={c.fir_id}>
              <td><button type="button" className="btn" aria-pressed={c.fir_id === picked} onClick={() => setPicked(c.fir_id)}>{t('fir.title', { no: c.fir_no, year: c.fir_year })}</button>
                <div className="sub">{c.station}</div></td>
              <td>{c.court ?? '—'}<div className="sub">{c.case_no ?? ''}</div></td>
              <td>{c.next_date ?? '—'}</td>
              <td>{c.summons_open > 0 ? <span className="chip c-warn">{t('court.summonsOpen', { n: c.summons_open })}</span> : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {row && <Case key={row.fir_id} row={row} onSaved={() => setVersion((n) => n + 1)} />}
      <FirstDate onSaved={() => setVersion((n) => n + 1)} />
    </>
  )
}
