import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Closure = { id: string; filed_on: string; court: string; report_no: string; ground: string; reason: string
  informant_informed_on: string | null; recorded_by_name: string; corrected: boolean
  decision: string | null; decided_on: string | null; decision_note: string | null }
type Correction = { id: string; report_no: string; filed_on: string; correction_reason: string; recorded_by_name: string }

/** Codes the server takes; their labels are closure.decision.<code> and closure.ground.<code> in the screen catalogs. */
const DECISION = ['accepted', 'further_investigation']
const GROUND = ['untraced', 'insufficient_evidence', 'false_complaint', 'civil_nature', 'other']

/**
 * The closure (final) report: the investigation ends without a chargesheet. The first entry is kept as written; a correction
 * is a new entry with a reason and the newest counts. The Magistrate's decision is recorded once and changes no deadline.
 */
export default function ClosureReport({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Closure[]>(`/firs/${firId}/closure-report`, version)
  const c = data?.[0]
  const history = useLoad<Correction[]>(`/firs/${firId}/closure-report/corrections`, version)
  const t = useT()
  const grounds = GROUND.map((k) => <option key={k} value={k}>{t.code('closure.ground', k)}</option>)
  return (
    <section>
      <h2>{t('closure.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : c ? (
        <>
          <p>{t('closure.line', { no: c.report_no, date: c.filed_on, court: c.court, ground: t.code('closure.ground', c.ground), reason: c.reason })}{' '}
            <small>({t('common.recordedBy', { name: c.recorded_by_name })}; {c.informant_informed_on ? t('closure.toldOn', { date: c.informant_informed_on }) : t('closure.notTold')}{c.corrected ? `; ${t('closure.correctedSee')}` : ''})</small></p>
          {c.decision
            ? <p>{t('closure.decidedLine', { decision: t.code('closure.decision', c.decision), date: c.decided_on ?? '' })}{c.decision_note ? ` ${c.decision_note}` : ''}</p>
            : (
              <Form title={t('closure.decisionTitle')} onSaved={onSaved}
                submit={(f) => send(`/firs/${firId}/closure-report/decision`, 'POST', {
                  decision: text(f, 'decision'), decidedOn: text(f, 'decided'), note: text(f, 'note'),
                })}>
                <label>{t('closure.decisionLabel')} <select name="decision">{DECISION.map((k) => <option key={k} value={k}>{t.code('closure.decision', k)}</option>)}</select></label>
                <label>{t('closure.decidedOn')} <input name="decided" type="date" required /></label>
                <label>{t('closure.note')} <input name="note" maxLength={2000} /></label>
                <p><small>{t('closure.decisionNote')}</small></p>
              </Form>
            )}
          <Form title={t('closure.correctTitle')} onSaved={onSaved}
            submit={(f) => send(`/firs/${firId}/closure-report/corrections`, 'POST', {
              filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), ground: text(f, 'ground'),
              reason: text(f, 'reason'), informantInformedOn: text(f, 'informed'), correctionReason: text(f, 'why'),
            })}>
            <label>{t('common.filedOn')} <input name="filed" type="date" required defaultValue={c.filed_on} /></label>
            <label>{t('common.court')} <input name="court" required maxLength={200} defaultValue={c.court} /></label>
            <label>{t('closure.number')} <input name="no" required maxLength={60} defaultValue={c.report_no} /></label>
            <label>{t('closure.ground')} <select name="ground" defaultValue={c.ground}>{grounds}</select></label>
            <label>{t('closure.reason')} <textarea name="reason" required minLength={10} maxLength={2000} defaultValue={c.reason} /></label>
            <label>{t('closure.informedOn')} <input name="informed" type="date" defaultValue={c.informant_informed_on ?? ''} /></label>
            <label>{t('common.whyCorrect')} <input name="why" required minLength={10} /></label>
            <p><small>{t('closure.correctNote')}</small></p>
          </Form>
          {!!history.data?.length && (
            <ul>{history.data.map((h) => <li key={h.id}>{h.report_no} / {h.filed_on}: {h.correction_reason} <small>({h.recorded_by_name})</small></li>)}</ul>
          )}
        </>
      ) : (
        <Form title={t('closure.formTitle')} onSaved={onSaved}
          submit={(f) => send(`/firs/${firId}/closure-report`, 'POST', {
            filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), ground: text(f, 'ground'),
            reason: text(f, 'reason'), informantInformedOn: text(f, 'informed'),
          })}>
          <label>{t('common.filedOn')} <input name="filed" type="date" required /></label>
          <label>{t('common.court')} <input name="court" required maxLength={200} /></label>
          <label>{t('closure.number')} <input name="no" required maxLength={60} /></label>
          <label>{t('closure.ground')} <select name="ground">{grounds}</select></label>
          <label>{t('closure.reason')} <textarea name="reason" required minLength={10} maxLength={2000} /></label>
          <label>{t('closure.informedOn')} <input name="informed" type="date" /></label>
          <p><small>{t('closure.formNote')}</small></p>
        </Form>
      )}
    </section>
  )
}
