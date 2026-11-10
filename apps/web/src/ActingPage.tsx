import { useState } from 'react'
import { currentSession, send } from './api'
import { fmt } from './formats'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Station = { id: string; district: string; name: string }
type Options = { officers: { id: string; full_name: string; rank: string; role: string }[]; roles: { code: string; label: string }[] }
type Charge = { id: string; full_name: string; rank: string; role: string; role_label: string; reason: string; ends_at: string; status: 'running' | 'ended' | 'finished'; ended_reason: string | null }

const CHIP: Record<string, string> = { running: 'c-ok', ended: 'c-neu', finished: 'c-neu' }

/**
 * Acting charge (BNSS 2(1)(r)): the SP of a district, or the state admin, gives an officer of a station the role of the
 * officer in charge for a limited time, with a reason, and ends it early with a reason. The server decides who may and
 * answers with its own reason; the screen only shows its answer.
 */
export default function ActingPage() {
  const t = useT()
  const stations = useLoad<Station[]>('/stations')
  const [chosen, setChosen] = useState<string>()
  if (stations.error) return <p role="alert">{stations.error}</p>
  if (!stations.data) return <p>{t('common.loading')}</p>
  const station = chosen ?? currentSession()?.user.station_id ?? stations.data[0]?.id
  return (
    <>
      <h1>{t('acting.title')}</h1>
      <p>{t('acting.intro')}</p>
      <label>{t('common.policeStation')} <select value={station ?? ''} onChange={(e) => setChosen(e.target.value)}>
        {stations.data.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
      </select></label>
      {station && <Station key={station} id={station} />}
    </>
  )
}

function Station({ id }: { id: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const options = useLoad<Options>(`/acting-charges/options?stationId=${id}`, version)
  const charges = useLoad<Charge[]>(`/acting-charges?stationId=${id}`, version)
  const again = () => setVersion((n) => n + 1)
  if (options.error || charges.error) return <p role="alert">{options.error ?? charges.error}</p>
  if (!options.data || !charges.data) return <p>{t('common.loading')}</p>
  return (
    <>
      <Give options={options.data} onSaved={again} />
      <section aria-labelledby="acting-list">
        <h2 id="acting-list">{t('acting.list')}</h2>
        {charges.data.length === 0 ? <p>{t('acting.none')}</p> : charges.data.map((c) => <Card key={c.id} charge={c} onSaved={again} />)}
      </section>
    </>
  )
}

function Give({ options, onSaved }: { options: Options; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    try {
      await send('/acting-charges', 'POST', { userId: String(f.get('userId')), role: String(f.get('role')), endsOn: String(f.get('endsOn')), reason: String(f.get('reason')).trim() })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <form onSubmit={submit} aria-labelledby="acting-give">
      <h2 id="acting-give">{t('acting.give')}</h2>
      <label>{t('acting.officer')} <select name="userId" required>
        {options.officers.map((o) => <option key={o.id} value={o.id}>{o.full_name} ({o.rank})</option>)}
      </select></label>
      <label>{t('acting.role')} <select name="role" required>
        {options.roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
      </select></label>
      <label>{t('acting.until')} <input type="date" name="endsOn" required /></label>
      <label>{t('acting.reason')} <textarea name="reason" required minLength={10} maxLength={500} rows={2} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('acting.send')}</button>
    </form>
  )
}

function Card({ charge: c, onSaved }: { charge: Charge; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function end(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      await send(`/acting-charges/${c.id}/end`, 'POST', { reason: String(new FormData(e.currentTarget).get('reason')).trim() })
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <article>
      <h3>{c.full_name} ({c.rank}) <span className={`chip ${CHIP[c.status]}`}>{t.code('acting.status', c.status)}</span></h3>
      <p>{t('acting.holds', { role: c.role_label, date: fmt(c.ends_at) })}</p>
      <p>{c.reason}</p>
      {c.ended_reason && <p>{t('acting.endedWhy', { reason: c.ended_reason })}</p>}
      {c.status === 'running' && (
        <form onSubmit={end}>
          <label>{t('acting.endReason')} <input name="reason" required minLength={10} maxLength={500} /></label>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('acting.end')}</button>
        </form>
      )}
    </article>
  )
}
