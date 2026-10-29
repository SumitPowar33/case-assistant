import { useEffect, useState, type FormEvent } from 'react'
import { currentSession, get, send } from './api'
import { fmt } from './formats'

type Policy = { key: string; label: string; default: number; min: number; max: number; effective: number }
type Station = { id: string; state_code: string; district: string; name: string }
type StatePack = { code: string; name: string }
type Change = { id: string; level: string; state_code: string; district: string | null; station_name: string | null; key: string; value: number; reason: string; set_by_name: string; set_at: string }

/**
 * Policies: what is in force at your own station, and a form to make a rule stricter for a state, district or station.
 * A unit can only tighten, never loosen; the server decides who may and answers with its own reason.
 */
export default function PoliciesPage() {
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
      form.reset(); setDone('Saved. The stricter value now applies.'); setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }

  if (error && !policies) return <p role="alert">{error}</p>
  if (!policies) return <p>Loading…</p>
  return (
    <>
      <h1>Policies</h1>
      <p>A state, district or police station may make a rule stricter than the unit above it, never looser. Every change keeps who made it and why.</p>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}
      <table>
        <caption>In force at your own station</caption>
        <thead><tr><th scope="col">Policy</th><th scope="col">Value now</th><th scope="col">Allowed range</th></tr></thead>
        <tbody>{policies.map((p) => <tr key={p.key}><th scope="row">{p.label}</th><td>{p.effective}</td><td>{p.min} to {p.max}</td></tr>)}</tbody>
      </table>
      {currentSession()?.user.can_set_policy && <form onSubmit={save} aria-label="Make a policy stricter">
        <h2>Make a policy stricter</h2>
        <label>Level <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="state">State</option><option value="district">District</option><option value="station">Police station</option></select></label>
        <label>Unit <select name="unit" required>
          {level === 'station' && stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}
          {level === 'district' && districts.map((s) => <option key={`${s.state_code}|${s.district}`} value={`${s.state_code}|${s.district}`}>{s.district} ({s.state_code})</option>)}
          {level === 'state' && packs.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}
        </select></label>
        <label>Policy <select name="key" required>{policies.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}</select></label>
        <label>New value <input name="value" type="number" required /></label>
        <label>Reason (at least 10 letters) <input name="reason" required minLength={10} /></label>
        <button type="submit">Save</button>
      </form>}
      <h2>Recent changes</h2>
      {changes.length === 0 ? <p>No changes you may see.</p> : (
        <ul>{changes.map((c) => (
          <li key={c.id}>{c.key} set to {c.value} for {c.station_name ?? c.district ?? c.state_code} ({c.level}) by {c.set_by_name} on {fmt(c.set_at)}. Reason: “{c.reason}”</li>
        ))}</ul>
      )}
    </>
  )
}
