import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'

type Chargesheet = { id: string; filed_on: string; court: string; report_no: string; recorded_by_name: string; accused: string
  correction_reason: string | null; replaced: boolean }
type Person = { id: string; role: string; label: string; display_name: string }

/** Fixes a wrong entry: a new chargesheet that replaces this one, with a reason. The old entry stays on record. */
function CorrectionForm({ firId, cs, accused, onSaved }: { firId: string; cs: Chargesheet; accused: Person[]; onSaved: () => void }) {
  const named = cs.accused.split(', ')
  return (
    <Form title="Correct this chargesheet entry" onSaved={onSaved}
      submit={(f) => {
        const accusedIds = accused.filter((p) => f.get(`a-${p.id}`) === 'on').map((p) => p.id)
        if (!accusedIds.length) throw new Error('Tick the accused this chargesheet names.')
        return send(`/firs/${firId}/chargesheets/${cs.id}/corrections`, 'POST',
          { filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), accusedIds, reason: text(f, 'reason') })
      }}>
      <label>Filed on <input name="filed" type="date" required defaultValue={cs.filed_on} /></label>
      <label>Court <input name="court" required maxLength={200} defaultValue={cs.court} /></label>
      <label>Chargesheet number <input name="no" required maxLength={60} defaultValue={cs.report_no} /></label>
      <p>Accused named in it:</p>
      {accused.map((p) => <label key={p.id}><input name={`a-${p.id}`} type="checkbox" defaultChecked={named.includes(p.label)} /> {p.label}: {p.display_name}</label>)}
      <label>Why this is being corrected <input name="reason" required minLength={10} /></label>
      <p><small>The earlier entry stays on record with your reason; only the new one counts for the deadlines.</small></p>
    </Form>
  )
}

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
        <ul>{data.map((c) => (
          <li key={c.id}>
            {c.replaced ? <del>{c.report_no}: filed on {c.filed_on} in {c.court}, naming {c.accused}</del> : <>{c.report_no}: filed on {c.filed_on} in {c.court}, naming {c.accused}</>}
            {' '}<small>(recorded by {c.recorded_by_name}{c.replaced ? '; replaced by a later entry' : ''})</small>
            {c.correction_reason && <small><br />Correction. Reason: {c.correction_reason}</small>}
            {!c.replaced && <CorrectionForm firId={firId} cs={c} accused={accused} onSaved={onSaved} />}
          </li>
        ))}</ul>
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
          <p><small>Entries are kept as written; fix a mistake with "Correct this chargesheet entry". A supplementary chargesheet is recorded as a new one.</small></p>
        </Form>
      )}
    </section>
  )
}
