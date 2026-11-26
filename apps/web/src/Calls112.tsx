import { useState } from 'react'
import { currentSession, send } from './api'
import { fmt, istIso } from './formats'
import { useT } from './i18n'
import { LANGS } from './typing'
import { useLoad } from './useLoad'

type Row = {
  id: string; received_at: string; place: string; kind: string; vehicle: string | null; caller_name: string | null; caller_contact: string | null
  details: string | null; withheld: boolean; entered_by_name: string; acknowledged_at: string | null; acknowledged_by_name: string | null
  complaint_id: string | null; diary_no: number | null
}
type Calls = { rows: Row[]; can_handle: boolean }
type Kind = { id: string; label: string }

const KINDS = ['crime_in_progress', 'violence', 'woman_in_distress', 'child_in_distress', 'accident', 'missing_person', 'fire_medical', 'dispute', 'other']

/**
 * Incoming 112 events (item 15): until the state's ERSS interface exists, the duty officer writes each call down by hand;
 * the same list will later be filled by the feed. An event is acknowledged once and opened once, as a complaint at the
 * front desk or as a general diary entry. The server decides who may write and answers with its own reason; a call about a
 * woman or a child in distress arrives with its caller and details withheld (the server sends none), and the form says
 * not to write a victim's name.
 */
export default function Calls112() {
  const t = useT()
  const station = currentSession()?.user.station_id
  const [version, setVersion] = useState(0)
  const calls = useLoad<Calls>(`/calls-112?stationId=${station}`, version)
  if (!station) return <p>{t('calls.noStation')}</p>
  if (calls.error) return <p role="alert">{calls.error}</p>
  if (!calls.data) return <p>{t('common.loading')}</p>
  const again = () => setVersion((n) => n + 1)
  return (
    <>
      <h1>{t('calls.title')}</h1>
      <p>{t('calls.intro')}</p>
      {calls.data.can_handle && <Add station={station} onSaved={again} />}
      <section aria-labelledby="calls-list">
        <h2 id="calls-list">{t('calls.list')}</h2>
        {calls.data.rows.length === 0 ? <p>{t('calls.none')}</p> : <ul>{calls.data.rows.map((r) => <Event key={r.id} row={r} handle={calls.data!.can_handle} onSaved={again} />)}</ul>}
      </section>
    </>
  )
}

function Add({ station, onSaved }: { station: string; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const val = (k: string) => String(f.get(k)).trim()
    try {
      await send('/calls-112', 'POST', {
        stationId: station, receivedAt: istIso(String(f.get('received'))), place: val('place'), kind: val('kind'), vehicle: val('vehicle') || null,
        callerName: val('name') || null, callerContact: val('contact') || null, details: val('details'),
      })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <form onSubmit={submit} aria-labelledby="calls-add">
      <h2 id="calls-add">{t('calls.add')}</h2>
      <p>{t('calls.noVictim')}</p>
      <label>{t('calls.received')} <input name="received" type="datetime-local" required /></label>
      <label>{t('calls.place')} <input name="place" required maxLength={300} /></label>
      <label>{t('calls.kind')} <select name="kind">{KINDS.map((k) => <option key={k} value={k}>{t.code('calls.kind', k)}</option>)}</select></label>
      <label>{t('calls.vehicle')} <input name="vehicle" maxLength={100} /></label>
      <label>{t('calls.caller')} <input name="name" maxLength={200} /></label>
      <label>{t('calls.contact')} <input name="contact" maxLength={100} /></label>
      <label>{t('calls.details')} <textarea name="details" required maxLength={2000} rows={4} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('calls.send')}</button>
    </form>
  )
}

function Event({ row: r, handle, onSaved }: { row: Row; handle: boolean; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function act(path: string, body?: unknown) {
    setError('')
    try { await send(path, 'POST', body); onSaved() } catch (err) { setError((err as Error).message) }
  }
  return (
    <li>
      <strong>{fmt(r.received_at)}</strong>: {t.code('calls.kind', r.kind)}, {r.place}
      {r.vehicle && <> ({t('calls.vehicle')}: {r.vehicle})</>}
      {r.withheld ? <p>{t('calls.withheld')}</p> : <p>{[r.caller_name, r.caller_contact].filter(Boolean).join(', ')}{r.caller_name || r.caller_contact ? ': ' : ''}{r.details}</p>}
      <p>{t('calls.enteredBy', { name: r.entered_by_name })}
        {r.acknowledged_at && <> · {t('calls.acknowledged', { name: r.acknowledged_by_name ?? '', time: fmt(r.acknowledged_at) })}</>}</p>
      {r.complaint_id && <p><a href={`#/complaints/${r.complaint_id}`}>{t('calls.openedComplaint')}</a></p>}
      {r.diary_no !== null && <p>{t('calls.openedDiary', { no: r.diary_no })}</p>}
      {handle && !r.acknowledged_at && <button type="button" onClick={() => act(`/calls-112/${r.id}/acknowledge`)}>{t('calls.acknowledge')}</button>}
      {handle && r.acknowledged_at && !r.complaint_id && r.diary_no === null && <OpenIt id={r.id} act={act} />}
      {error && <p role="alert">{error}</p>}
    </li>
  )
}

function OpenIt({ id, act }: { id: string; act: (path: string, body?: unknown) => Promise<void> }) {
  const t = useT()
  const kinds = useLoad<Kind[]>('/complaint-kinds')
  const [kind, setKind] = useState('')
  const [lang, setLang] = useState('en')
  return (
    <div>
      <label>{t('calls.complaintKind')} <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="">—</option>
        {(kinds.data ?? []).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select></label>
      <label>{t('calls.language')} <select value={lang} onChange={(e) => setLang(e.target.value)}>
        <option value="en">English</option>
        {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code}>{l.label} ({l.name})</option>)}
      </select></label>
      <button type="button" disabled={!kind} onClick={() => act(`/calls-112/${id}/open`, { as: 'complaint', complaintKind: kind, textLanguage: lang })}>{t('calls.asComplaint')}</button>
      <button type="button" onClick={() => act(`/calls-112/${id}/open`, { as: 'diary' })}>{t('calls.asDiary')}</button>
    </div>
  )
}
