import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'

type Chargesheet = { id: string; filed_on: string; court: string; report_no: string; recorded_by_name: string; accused: string }
type Person = { id: string; role: string; label: string; display_name: string }

/**
 * Chargesheets (police reports, BNSS 193(3)) filed in court, each naming the accused it covers. Kept as written;
 * a supplementary chargesheet is a new entry. Filing ends the custody limit for the accused named.
 */
export default function Chargesheets({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Chargesheet[]>(`/firs/${firId}/chargesheets`, version)
  const { data: people } = useLoad<Person[]>(`/firs/${firId}/people`, version)
  const accused = (people ?? []).filter((p) => p.role === 'accused')
  return (
    <section>
      <h2>Chargesheets</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : !data.length ? <p>None filed yet.</p> : (
        <ul>{data.map((c) => <li key={c.id}>{c.report_no}: filed on {c.filed_on} in {c.court}, naming {c.accused} <small>(recorded by {c.recorded_by_name})</small></li>)}</ul>
      )}
      {accused.length > 0 && (
        <Form title="Record a chargesheet filed in court" onSaved={onSaved}
          submit={(f) => {
            const accusedIds = accused.filter((p) => f.get(`a-${p.id}`) === 'on').map((p) => p.id)
            if (!accusedIds.length) throw new Error('Tick the accused this chargesheet names.')
            return send(`/firs/${firId}/chargesheets`, 'POST', { filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), accusedIds })
          }}>
          <label>Filed on <input name="filed" type="date" required /></label>
          <label>Court <input name="court" required maxLength={200} /></label>
          <label>Chargesheet number <input name="no" required maxLength={60} /></label>
          <p>Accused named in it:</p>
          {accused.map((p) => <label key={p.id}><input name={`a-${p.id}`} type="checkbox" /> {p.label}: {p.display_name}</label>)}
          <p><small>It cannot be changed after saving; a supplementary chargesheet is recorded as a new one.</small></p>
        </Form>
      )}
    </section>
  )
}
