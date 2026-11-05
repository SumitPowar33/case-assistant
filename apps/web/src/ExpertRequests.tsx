import { useState } from 'react'
import { send } from './api'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Request = {
  id: string; fir_id: string; fir_no: number; fir_year: number; kind: string; subject: string; sent_to: string; sent_on: string
  station: string; status: string; note: string | null; days_waiting: number | null; reminder_due: boolean
}
type List = { requests: Request[]; counts: Record<string, number> }
type Step = { id: string; status: string; on_date: string; note: string | null }
type FirRow = { id: string; fir_no: number; fir_year: number }

const STATUS_CHIP: Record<string, string> = { sent: 'c-neu', at_lab: 'c-info', sample_sent: 'c-info', report_received: 'c-ok' }
const NEXT = ['at_lab', 'sample_sent', 'report_received', 'reminder_sent'] as const
const today = () => new Date().toISOString().slice(0, 10)

/** The steps of one request, oldest first, and the form that adds the next one (steps are kept as written, V44). */
function Steps({ request, onSaved }: { request: Request; onSaved: () => void }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const path = `/firs/${request.fir_id}/expert-requests/${request.id}/steps`
  const { data, error: loadError } = useLoad<Step[]>(path, version)
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    try {
      await send(path, 'POST', { status: String(f.get('status')), date: String(f.get('date')), note: String(f.get('note') ?? '').trim() })
      form.reset()
      setVersion((n) => n + 1)
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  const steps = Array.isArray(data) ? data : []
  return (
    <section aria-labelledby="exp-steps">
      <h2 id="exp-steps">{t('exp.steps', { subject: request.subject })}</h2>
      <p><a href={`#/firs/${request.fir_id}`}>{t('prop.openCase', { no: request.fir_no, year: request.fir_year })}</a></p>
      {loadError ? <p role="alert">{loadError}</p> : (
        <div className="table-scroll"><table>
          <caption>{t('exp.steps', { subject: request.subject })}</caption>
          <thead><tr><th scope="col">{t('prop.colWhen')}</th><th scope="col">{t('prop.colStatus')}</th><th scope="col">{t('exp.colNote')}</th></tr></thead>
          <tbody>{steps.map((s) => (
            <tr key={s.id}><td>{s.on_date}</td><td>{t.code('expStatus', s.status)}</td><td>{s.note ?? ''}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {error && <p role="alert">{error}</p>}
      {request.status !== 'report_received' && (
        <form className="record-form" onSubmit={(e) => void save(e)}>
          <h3>{t('exp.record')}</h3>
          <label>{t('prop.colStatus')} <select name="status" defaultValue="at_lab">
            {NEXT.map((s) => <option key={s} value={s}>{t.code('expStatus', s)}</option>)}
          </select></label>
          <label>{t('exp.date')} <input name="date" type="date" required defaultValue={today()} max={today()} /></label>
          <label>{t('exp.note')} <input name="note" maxLength={500} /></label>
          <button type="submit">{t('exp.save')}</button>
        </form>
      )}
    </section>
  )
}

/** Raises a request on one of the person's cases (the newest 100 are offered). */
function NewRequest({ onSaved }: { onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  const { data } = useLoad<FirRow[]>('/firs?limit=100&offset=0')
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    try {
      await send(`/firs/${v('fir')}/expert-requests`, 'POST', { kind: v('kind'), subject: v('subject'), sentTo: v('sentTo'), date: v('date') })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  const firs = Array.isArray(data) ? data : []
  return (
    <form className="record-form" onSubmit={(e) => void save(e)}>
      <h2>{t('exp.newTitle')}</h2>
      {error && <p role="alert">{error}</p>}
      <label>{t('prop.colCase')} <select name="fir" required defaultValue="">
        <option value="" disabled>{t('exp.noCase')}</option>
        {firs.map((f) => <option key={f.id} value={f.id}>{t('fir.title', { no: f.fir_no, year: f.fir_year })}</option>)}
      </select></label>
      <label>{t('exp.kind')} <select name="kind" defaultValue="forensic">
        {(['forensic', 'medical'] as const).map((k) => <option key={k} value={k}>{t.code('expKind', k)}</option>)}
      </select></label>
      <label>{t('exp.subject')} <input name="subject" required minLength={2} maxLength={200} /></label>
      <label>{t('exp.sentTo')} <input name="sentTo" required minLength={2} maxLength={160} /></label>
      <label>{t('exp.date')} <input name="date" type="date" required defaultValue={today()} max={today()} /></label>
      <button type="submit">{t('exp.create')}</button>
    </form>
  )
}

/**
 * Forensic and medical requests (design board 16): the requests of the cases the person may open, where each stands by
 * its newest step, how many days it has waited, and a "reminder due" mark after 30 days without a report (the officer
 * decides whether to send one). The board's MedLEaPR link and queue positions are not built (no such interface here).
 */
export default function ExpertRequests() {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const { data, error } = useLoad<List>('/expert-requests', version)
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  const requests = Array.isArray(data.requests) ? data.requests : []
  const request = requests.find((r) => r.id === picked)
  return (
    <>
      <h1>{t('exp.title')}</h1>
      <p className="lede">{t('exp.intro')}</p>
      <p>
        <span className="chip c-info">{t('exp.countOpen', { n: data.counts?.open ?? 0 })}</span>{' '}
        <span className="chip c-warn">{t('exp.countDue', { n: data.counts?.reminder_due ?? 0 })}</span>{' '}
        <span className="chip c-ok">{t('exp.countDone', { n: data.counts?.report_received ?? 0 })}</span>
      </p>
      {requests.length === 0 ? <p>{t('common.noneYet')}</p> : (
        <div className="table-scroll"><table>
          <caption>{t('exp.caption')}</caption>
          <thead><tr>{(['exp.colRequest', 'exp.colTo', 'prop.colStatus', 'exp.colWaiting'] as const).map((c) => <th key={c} scope="col">{t(c)}</th>)}</tr></thead>
          <tbody>{requests.map((r) => (
            <tr key={r.id}>
              <td><button type="button" className="btn" aria-pressed={r.id === picked} onClick={() => setPicked(r.id)}>{r.subject}</button>
                <div className="sub">{t('fir.title', { no: r.fir_no, year: r.fir_year })} · {t.code('expKind', r.kind)}</div></td>
              <td>{r.sent_to}<div className="sub">{r.sent_on}</div></td>
              <td><span className={`chip ${STATUS_CHIP[r.status] ?? 'c-neu'}`}>{t.code('expStatus', r.status)}</span>
                {r.note && <div className="sub">{r.note}</div>}</td>
              <td>{r.days_waiting === null ? '—' : t('exp.days', { n: r.days_waiting })}
                {r.reminder_due && <div><span className="chip c-warn">{t('exp.reminderDue')}</span></div>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {request && <Steps key={request.id} request={request} onSaved={() => setVersion((n) => n + 1)} />}
      <NewRequest onSaved={() => setVersion((n) => n + 1)} />
    </>
  )
}
