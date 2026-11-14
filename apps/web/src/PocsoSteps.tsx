import { send } from './api'
import { useLoad } from './useLoad'
import { Form } from './Forms'
import { fmt, istIso } from './formats'
import { useT } from './i18n'

type Step = { step: string; basis: string; limit_hours: number | null; due_at: string | null; done_at: string | null; recorded_by_name: string | null }
type Pocso = { pocso: boolean; steps: Step[] }

/**
 * POCSO case mode (item 15): a case with a POCSO section, or a child victim of a sexual offence, shows the steps the law
 * asks for, red until the case team records each done. Two have a 24-hour limit and are also deadlines (POCSO 19(6),
 * POCSO 27 with BNSS 184(1)). Nothing is shown for any other case; only the case team sees it (the FIR screen decides).
 * No names are recorded: only the step and when.
 */
export default function PocsoSteps({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const t = useT()
  const { data, error } = useLoad<Pocso>(`/firs/${firId}/pocso`, version)
  if (error) return <p role="alert">{error}</p>
  if (!data?.pocso) return null
  const open = data.steps.filter((s) => !s.done_at)
  return (
    <section aria-labelledby="pocso-title">
      <h3 id="pocso-title">{t('pocso.title')}</h3>
      <p>{t('pocso.note')}</p>
      <ul className="plain">{data.steps.map((s) => (
        <li key={s.step} className="card">
          <span className={`chip ${s.done_at ? 'c-ok' : 'c-crit'}`}>{t(s.done_at ? 'pocso.doneChip' : 'pocso.open')}</span>{' '}
          <strong>{t.code('pocsoStep', s.step)}</strong> <small>({s.basis})</small>
          <div>{s.done_at ? t('pocso.done', { time: fmt(s.done_at), officer: s.recorded_by_name ?? '' })
            : s.due_at ? t('pocso.due', { time: fmt(s.due_at) }) : t('pocso.noLimit')}</div>
        </li>
      ))}</ul>
      <Form title={t('pocso.record')} onSaved={onSaved}
        submit={(f) => send(`/firs/${firId}/pocso-steps`, 'POST', { step: f.get('step'), doneAt: istIso(String(f.get('doneAt'))) })}>
        <label>{t('pocso.step')} <select name="step" defaultValue={open[0]?.step ?? data.steps[0].step}>
          {data.steps.map((s) => <option key={s.step} value={s.step}>{t.code('pocsoStep', s.step)}</option>)}</select></label>
        <label>{t('pocso.doneAt')} <input name="doneAt" type="datetime-local" required /></label>
      </Form>
    </section>
  )
}
