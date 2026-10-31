import { useEffect, useState, type FormEvent } from 'react'
import { currentSession, get, send } from './api'
import { fmt } from './formats'
import { useT } from './i18n'

type Policy = { key: string; label: string; default: number; min: number; max: number; effective: number }
type Station = { id: string; state_code: string; district: string; name: string }
type StatePack = { code: string; name: string }
type Change = { id: string; level: string; state_code: string; district: string | null; station_name: string | null; key: string; value: number; reason: string; set_by_name: string; set_at: string }

/**
 * Policies: what is in force at your own station, and a form to make a rule stricter for a state, district or station.
 * A unit can only tighten, never loosen; the server decides who may and answers with its own reason.
 */
export default function PoliciesPage() {
  const t = useT()
  const [policies, setPolicies] = useState<Policy[]>()
  const [changes, setChanges] = useState<Change[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [packs, setPacks] = useState<StatePack[]>([])
  const [level, setLevel] = useState('station')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([get<Policy[]>('/policies'), get<Change[]>('/policy-settings'), get<Station[]>('/stations'), get<StatePack[]>('/state-packs')])
      .then(([p, c, s, k]) => { if (live) { setPolicies(p); setChanges(c); setStations(s); setPacks(k) } }, (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [version])

  const districts = [...new Map(stations.map((s) => [`${s.state_code}|${s.district}`, s])).values()]

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(''); setDone('')
    const form = e.currentTarget
    const f = new FormData(form)
    const [a, b] = String(f.get('unit')).split('|')
    const unit = level === 'station' ? { stationId: a } : level === 'district' ? { stateCode: a, district: b } : { stateCode: a }
    try {
      await send('/policy-settings', 'POST', { level, ...unit, key: f.get('key'), value: Number(f.get('value')), reason: String(f.get('reason')).trim() })
      form.reset(); setDone(t('policies.saved')); setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }

  if (error && !policies) return <p role="alert">{error}</p>
  if (!policies) return <p>{t('common.loading')}</p>
  return (
    <>
      <h1>{t('policies.title')}</h1>
      <p>{t('policies.intro')}</p>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}
      <table>
        <caption>{t('policies.caption')}</caption>
        <thead><tr><th scope="col">{t('policies.colPolicy')}</th><th scope="col">{t('policies.colValue')}</th><th scope="col">{t('policies.colRange')}</th></tr></thead>
        <tbody>{policies.map((p) => <tr key={p.key}><th scope="row">{p.label}</th><td>{p.effective}</td><td>{t('policies.range', { min: p.min, max: p.max })}</td></tr>)}</tbody>
      </table>
      {currentSession()?.user.can_set_policy && <form onSubmit={save} aria-label={t('policies.formTitle')}>
        <h2>{t('policies.formTitle')}</h2>
        <label>{t('policies.level')} <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="state">{t('policies.optState')}</option><option value="district">{t('policies.optDistrict')}</option><option value="station">{t('common.policeStation')}</option></select></label>
        <label>{t('policies.unit')} <select name="unit" required>
          {level === 'station' && stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
          {level === 'district' && districts.map((s) => <option key={`${s.state_code}|${s.district}`} value={`${s.state_code}|${s.district}`}>{s.district} ({s.state_code})</option>)}
          {level === 'state' && packs.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
        </select></label>
        <label>{t('policies.colPolicy')} <select name="key" required>{policies.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}</select></label>
        <label>{t('policies.newValue')} <input name="value" type="number" required /></label>
        <label>{t('outcome.reason')} <input name="reason" required minLength={10} /></label>
        <button type="submit">{t('form.save')}</button>
      </form>}
      <h2>{t('policies.recent')}</h2>
      {changes.length === 0 ? <p>{t('policies.noChanges')}</p> : (
        <ul>{changes.map((c) => (
          <li key={c.id}>{t('policies.change', { key: c.key, value: c.value, unit: c.station_name ?? c.district ?? c.state_code, level: t.code('policies.unitKind', c.level), by: c.set_by_name, date: fmt(c.set_at), reason: c.reason })}</li>
        ))}</ul>
      )}
    </>
  )
}
