import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'

type Closure = { id: string; filed_on: string; court: string; report_no: string; ground: string; reason: string
  informant_informed_on: string | null; recorded_by_name: string }

const GROUND: Record<string, string> = {
  untraced: 'Accused not traced', insufficient_evidence: 'Not enough evidence', false_complaint: 'Complaint found false',
  civil_nature: 'Matter is civil in nature', other: 'Other (explain in the reason)',
}

/**
 * The closure (final) report: the investigation ends without a chargesheet. Recorded once and kept as written.
 * The Magistrate decides whether to accept it; that decision is not recorded here.
 */
export default function ClosureReport({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Closure[]>(`/firs/${firId}/closure-report`, version)
  const c = data?.[0]
  return (
    <section>
      <h2>Closure report</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : c ? (
        <p>{c.report_no}: filed on {c.filed_on} in {c.court}. {GROUND[c.ground]}. Reason: {c.reason}{' '}
          <small>(recorded by {c.recorded_by_name}; informant {c.informant_informed_on ? `told on ${c.informant_informed_on}` : 'not yet recorded as told'})</small></p>
      ) : (
        <Form title="Record a closure report (no chargesheet will be filed)" onSaved={onSaved}
          submit={(f) => send(`/firs/${firId}/closure-report`, 'POST', {
            filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), ground: text(f, 'ground'),
            reason: text(f, 'reason'), informantInformedOn: text(f, 'informed'),
          })}>
          <label>Filed on <input name="filed" type="date" required /></label>
          <label>Court <input name="court" required maxLength={200} /></label>
          <label>Report number <input name="no" required maxLength={60} /></label>
          <label>Ground <select name="ground">{Object.entries(GROUND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Reason in your words <textarea name="reason" required minLength={10} maxLength={2000} /></label>
          <label>Informant told on (if already done) <input name="informed" type="date" /></label>
          <p><small>Kept as written and recorded once. It ends the two-month limit of BNSS 193(2) but not the custody limit; record the release of anyone still in custody. Not possible while a chargesheet stands.</small></p>
        </Form>
      )}
    </section>
  )
}
