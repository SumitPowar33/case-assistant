import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'

type Closure = { id: string; filed_on: string; court: string; report_no: string; ground: string; reason: string
  informant_informed_on: string | null; recorded_by_name: string; corrected: boolean
  decision: string | null; decided_on: string | null; decision_note: string | null }
type Correction = { id: string; report_no: string; filed_on: string; correction_reason: string; recorded_by_name: string }

const DECISION: Record<string, string> = { accepted: 'Magistrate accepted the report', further_investigation: 'Magistrate ordered further investigation' }

const GROUND: Record<string, string> = {
  untraced: 'Accused not traced', insufficient_evidence: 'Not enough evidence', false_complaint: 'Complaint found false',
  civil_nature: 'Matter is civil in nature', other: 'Other (explain in the reason)',
}

/**
 * The closure (final) report: the investigation ends without a chargesheet. The first entry is kept as written; a correction
 * is a new entry with a reason and the newest counts. The Magistrate's decision is recorded once and changes no deadline.
 */
export default function ClosureReport({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Closure[]>(`/firs/${firId}/closure-report`, version)
  const c = data?.[0]
  const history = useLoad<Correction[]>(`/firs/${firId}/closure-report/corrections`, version)
  return (
    <section>
      <h2>Closure report</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : c ? (
        <>
          <p>{c.report_no}: filed on {c.filed_on} in {c.court}. {GROUND[c.ground]}. Reason: {c.reason}{' '}
            <small>(recorded by {c.recorded_by_name}; informant {c.informant_informed_on ? `told on ${c.informant_informed_on}` : 'not yet recorded as told'}{c.corrected ? '; corrected, see below' : ''})</small></p>
          {c.decision
            ? <p>{DECISION[c.decision]} on {c.decided_on}.{c.decision_note ? ` ${c.decision_note}` : ''}</p>
            : (
              <Form title="Record the Magistrate's decision" onSaved={onSaved}
                submit={(f) => send(`/firs/${firId}/closure-report/decision`, 'POST', {
                  decision: text(f, 'decision'), decidedOn: text(f, 'decided'), note: text(f, 'note'),
                })}>
                <label>Decision <select name="decision">{Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Decided on <input name="decided" type="date" required /></label>
                <label>Order number or note <input name="note" maxLength={2000} /></label>
                <p><small>Recorded once and kept as written. It changes no deadline; a chargesheet can still be recorded if further investigation is ordered.</small></p>
              </Form>
            )}
          <Form title="Correct this closure report" onSaved={onSaved}
            submit={(f) => send(`/firs/${firId}/closure-report/corrections`, 'POST', {
              filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), ground: text(f, 'ground'),
              reason: text(f, 'reason'), informantInformedOn: text(f, 'informed'), correctionReason: text(f, 'why'),
            })}>
            <label>Filed on <input name="filed" type="date" required defaultValue={c.filed_on} /></label>
            <label>Court <input name="court" required maxLength={200} defaultValue={c.court} /></label>
            <label>Report number <input name="no" required maxLength={60} defaultValue={c.report_no} /></label>
            <label>Ground <select name="ground" defaultValue={c.ground}>{Object.entries(GROUND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Reason in your words <textarea name="reason" required minLength={10} maxLength={2000} defaultValue={c.reason} /></label>
            <label>Informant told on (if already done) <input name="informed" type="date" defaultValue={c.informant_informed_on ?? ''} /></label>
            <label>Why this is being corrected <input name="why" required minLength={10} /></label>
            <p><small>The earlier entry stays on record with your reason; the newest counts.</small></p>
          </Form>
          {!!history.data?.length && (
            <ul>{history.data.map((h) => <li key={h.id}>{h.report_no} / {h.filed_on}: {h.correction_reason} <small>({h.recorded_by_name})</small></li>)}</ul>
          )}
        </>
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
