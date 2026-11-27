import { useState } from 'react'
import { currentSession, send } from './api'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Row = { id: string; full_name: string; rank: string; on_date: string; kind: 'duty' | 'weekly_off' | 'leave'; shift: string | null; post: string | null; note: string | null }
type Clash = Pick<Row, 'full_name' | 'rank' | 'on_date' | 'kind' | 'shift' | 'post'> & { officer_id: string; fir_id: string; fir_no: number; fir_year: number }
type Roster = { rows: Row[]; now: { shift: string; on_duty: Row[] }; court_clashes?: Clash[]; can_manage: boolean }
type Officer = { id: string; full_name: string; rank: string }

const SHIFTS = ['morning', 'evening', 'night']
const POSTS = ['station_house', 'front_desk', 'beat', 'patrol', 'court', 'lock_up', 'bandobast']
const KINDS = ['duty', 'weekly_off', 'leave']

/**
 * Station duty roster (item 16): the next 31 days of the officer's own police station, who is on duty now, and, for the
 * officer in charge, a form to write an entry and a way to take one back with a reason. The server decides who may
 * write and answers with its own reason; the screen only shows its answer.
 */
export default function DutyRoster() {
  const t = useT()
  const station = currentSession()?.user.station_id
  const [version, setVersion] = useState(0)
  const roster = useLoad<Roster>(`/duty-roster?stationId=${station}`, version)
  if (!station) return <p>{t('roster.noStation')}</p>
  if (roster.error) return <p role="alert">{roster.error}</p>
  if (!roster.data) return <p>{t('common.loading')}</p>
  const { rows, now, can_manage: manage } = roster.data
  const days = [...new Set(rows.map((r) => r.on_date))]
  const clashes = roster.data.court_clashes ?? []
  const entry = (r: Pick<Row, 'kind' | 'shift' | 'post'>) => r.kind === 'duty' ? `${t.code('roster.shift', r.shift ?? '')}, ${t.code('roster.post', r.post ?? '')}` : t.code('roster.kind', r.kind)
  const again = () => setVersion((n) => n + 1)
  return (
    <>
      <h1>{t('roster.title')}</h1>
      <p>{t('roster.intro')}</p>
      <section aria-labelledby="roster-now">
        <h2 id="roster-now">{t('roster.now', { shift: t.code('roster.shift', now.shift) })}</h2>
        {now.on_duty.length === 0 ? <p>{t('roster.nobody')}</p>
          : <ul>{now.on_duty.map((r) => <li key={r.id}>{r.full_name} ({r.rank}): {t.code('roster.post', r.post ?? '')}</li>)}</ul>}
      </section>
      {clashes.length > 0 && (
        <section aria-labelledby="roster-court">
          <h2 id="roster-court">{t('roster.court', { count: clashes.length })}</h2>
          <p className="note">{t('roster.courtNote')}</p>
          <ul className="plain">{clashes.map((c) => (
            <li key={`${c.on_date} ${c.officer_id} ${c.fir_id}`} className="card">
              <span className="chip c-warn">{c.on_date}</span> <a href="#/court">{t('roster.courtCase', { fir: `${c.fir_no}/${c.fir_year}` })}</a>
              <p>{t('roster.courtOfficer', { officer: `${c.full_name} (${c.rank})`, entry: entry(c) })}</p>
            </li>
          ))}</ul>
        </section>
      )}
      {manage && <Add station={station} onSaved={again} />}
      <section aria-labelledby="roster-list">
        <h2 id="roster-list">{t('roster.list')}</h2>
        {days.length === 0 ? <p>{t('roster.none')}</p> : days.map((d) => (
          <article key={d}>
            <h3>{d}</h3>
            <ul>{rows.filter((r) => r.on_date === d).map((r) => <Entry key={r.id} row={r} text={entry(r)} manage={manage} onSaved={again} />)}</ul>
          </article>
        ))}
      </section>
    </>
  )
}

function Add({ station, onSaved }: { station: string; onSaved: () => void }) {
  const t = useT()
  const officers = useLoad<Officer[]>(`/duty-roster/options?stationId=${station}`)
  const [kind, setKind] = useState('duty')
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const duty = kind === 'duty'
    try {
      await send('/duty-roster', 'POST', {
        stationId: station, officerId: String(f.get('officerId')), date: String(f.get('date')), kind,
        shift: duty ? String(f.get('shift')) : null, post: duty ? String(f.get('post')) : null, note: String(f.get('note')).trim() || null,
      })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  if (!officers.data) return officers.error ? <p role="alert">{officers.error}</p> : <p>{t('common.loading')}</p>
  return (
    <form onSubmit={submit} aria-labelledby="roster-add">
      <h2 id="roster-add">{t('roster.add')}</h2>
      <label>{t('roster.officer')} <select name="officerId" required>
        {officers.data.map((o) => <option key={o.id} value={o.id}>{o.full_name} ({o.rank})</option>)}
      </select></label>
      <label>{t('roster.date')} <input type="date" name="date" required /></label>
      <label>{t('roster.kind')} <select value={kind} onChange={(e) => setKind(e.target.value)}>
        {KINDS.map((k) => <option key={k} value={k}>{t.code('roster.kind', k)}</option>)}
      </select></label>
      {kind === 'duty' && <>
        <label>{t('roster.shiftLabel')} <select name="shift">{SHIFTS.map((s) => <option key={s} value={s}>{t.code('roster.shift', s)}</option>)}</select></label>
        <label>{t('roster.post')} <select name="post">{POSTS.map((p) => <option key={p} value={p}>{t.code('roster.post', p)}</option>)}</select></label>
      </>}
      <label>{t('roster.note')} <input name="note" maxLength={300} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('roster.send')}</button>
    </form>
  )
}

function Entry({ row: r, text, manage, onSaved }: { row: Row; text: string; manage: boolean; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function takeBack(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      await send(`/duty-roster/${r.id}/cancel`, 'POST', { reason: String(new FormData(e.currentTarget).get('reason')).trim() })
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <li>
      {r.full_name} ({r.rank}): {text}
      {r.note && ` (${r.note})`}
      {manage && (
        <form onSubmit={takeBack}>
          <label>{t('roster.cancelReason')} <input name="reason" required minLength={10} maxLength={500} /></label>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('roster.takeBack')}</button>
        </form>
      )}
    </li>
  )
}
