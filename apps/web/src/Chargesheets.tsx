import { send } from './api'
import { Form } from './Forms'
import { text } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Chargesheet = { id: string; filed_on: string; court: string; report_no: string; recorded_by_name: string; accused: string
  correction_reason: string | null; replaced: boolean }
type Person = { id: string; role: string; label: string; display_name: string }

/** Fixes a wrong entry: a new chargesheet that replaces this one, with a reason. The old entry stays on record. */
function CorrectionForm({ firId, cs, accused, onSaved }: { firId: string; cs: Chargesheet; accused: Person[]; onSaved: () => void }) {
  const t = useT()
  const named = cs.accused.split(', ')
  return (
    <Form title={t('cs.correctTitle')} onSaved={onSaved}
      submit={(f) => {
        const accusedIds = accused.filter((p) => f.get(`a-${p.id}`) === 'on').map((p) => p.id)
        if (!accusedIds.length) throw new Error(t('cs.needAccused'))
        return send(`/firs/${firId}/chargesheets/${cs.id}/corrections`, 'POST',
          { filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), accusedIds, reason: text(f, 'reason') })
      }}>
      <label>{t('common.filedOn')} <input name="filed" type="date" required defaultValue={cs.filed_on} /></label>
      <label>{t('common.court')} <input name="court" required maxLength={200} defaultValue={cs.court} /></label>
      <label>{t('cs.number')} <input name="no" required maxLength={60} defaultValue={cs.report_no} /></label>
      <p>{t('cs.accusedNamed')}</p>
      {accused.map((p) => <label key={p.id}><input name={`a-${p.id}`} type="checkbox" defaultChecked={named.includes(p.label)} /> {p.label}: {p.display_name}</label>)}
      <label>{t('common.whyCorrect')} <input name="reason" required minLength={10} /></label>
      <p><small>{t('cs.correctNote')}</small></p>
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
  const t = useT()
  return (
    <section>
      <h2>{t('cs.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('cs.noneFiled')}</p> : (
        <ul>{data.map((c) => {
          const line = t('cs.line', { no: c.report_no, date: c.filed_on, court: c.court, accused: c.accused })
          return <li key={c.id}>
            {c.replaced ? <del>{line}</del> : line}
            {' '}<small>({t('common.recordedBy', { name: c.recorded_by_name })}{c.replaced ? `; ${t('cs.replacedNote')}` : ''})</small>
            {c.correction_reason && <small><br />{t('cs.correctionLine', { reason: c.correction_reason })}</small>}
            {!c.replaced && <CorrectionForm firId={firId} cs={c} accused={accused} onSaved={onSaved} />}
          </li>
        })}</ul>
      )}
      {accused.length > 0 && (
        <Form title={t('cs.formTitle')} onSaved={onSaved}
          submit={(f) => {
            const accusedIds = accused.filter((p) => f.get(`a-${p.id}`) === 'on').map((p) => p.id)
            if (!accusedIds.length) throw new Error(t('cs.needAccused'))
            return send(`/firs/${firId}/chargesheets`, 'POST', { filedOn: text(f, 'filed'), court: text(f, 'court'), reportNo: text(f, 'no'), accusedIds })
          }}>
          <label>{t('common.filedOn')} <input name="filed" type="date" required /></label>
          <label>{t('common.court')} <input name="court" required maxLength={200} /></label>
          <label>{t('cs.number')} <input name="no" required maxLength={60} /></label>
          <p>{t('cs.accusedNamed')}</p>
          {accused.map((p) => <label key={p.id}><input name={`a-${p.id}`} type="checkbox" /> {p.label}: {p.display_name}</label>)}
          <p><small>{t('cs.formNote', { correct: t('cs.correctTitle') })}</small></p>
        </Form>
      )}
    </section>
  )
}
