import { send } from './api'
import { useLoad } from './useLoad'
import { Form } from './Forms'
import { useT } from './i18n'

type Update = { given_on: string; told_to: string; means: string; recorded_by_name: string }
const TOLD_TO = ['victim', 'informant']
const MEANS = ['in_person', 'phone', 'sms', 'email', 'letter', 'other']

/**
 * BNSS 193(3)(ii): within 90 days the informant or victim is told how the investigation is going. Recording the update
 * given ends the deadline. No names are recorded: only to whom, how and on which day.
 */
export default function VictimUpdates({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const t = useT()
  const { data, error } = useLoad<Update[]>(`/firs/${firId}/victim-updates`, version)
  return (
    <section>
      <h3>{t('victim.title')}</h3>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('victim.none')}</p>
        : <ul>{data.map((u, i) => <li key={i}>{t('victim.given', { date: u.given_on, whom: t.code('victimTo', u.told_to), means: t.code('victimMeans', u.means), officer: u.recorded_by_name })}</li>)}</ul>}
      <Form title={t('victim.record')} onSaved={onSaved}
        submit={(f) => send(`/firs/${firId}/victim-updates`, 'POST', { givenOn: f.get('givenOn'), toldTo: f.get('toldTo'), means: f.get('means') })}>
        <label>{t('victim.givenOn')} <input name="givenOn" type="date" required /></label>
        <label>{t('victim.toldTo')} <select name="toldTo" defaultValue="victim">{TOLD_TO.map((k) => <option key={k} value={k}>{t.code('victimTo', k)}</option>)}</select></label>
        <label>{t('victim.means')} <select name="means" defaultValue="phone">{MEANS.map((k) => <option key={k} value={k}>{t.code('victimMeans', k)}</option>)}</select></label>
      </Form>
    </section>
  )
}
