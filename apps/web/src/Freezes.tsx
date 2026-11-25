import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import { fmt, istToday, rupees, text } from './formats'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Step = { on_date: string; reference: string; reason: string | null; recorded_by: string; recorded_at: string }
type Freeze = { id: string; addressee: string; accounts: string; status: string; issued_at: string; report_due_on: string; held_paise: number
  steps: { reported?: Step; released?: Step } }

/**
 * Bank freezes (FreezeController): each BNSS 106 notice sent to a bank (written on the Notices part), the amount the bank
 * holds on its accounts by the money trail, and the two steps that follow it, each recorded once and kept as written: the
 * report of the seizure to the Magistrate (due by the date shown, BNSS 106(3)) and the release, with the order and a reason.
 */
export default function Freezes({ firId }: { firId: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const { data, error } = useLoad<Freeze[]>(`/firs/${firId}/freezes`, version)
  const freezes = Array.isArray(data) ? data : []
  const step = (id: string, kind: 'reported' | 'released') => async (f: FormData) =>
    send(`/firs/${firId}/freezes/${id}/steps`, 'POST', { kind, onDate: text(f, 'onDate'), reference: text(f, 'reference'), reason: text(f, 'reason') })
  const saved = () => setVersion((v) => v + 1)
  return (
    <section aria-labelledby="freeze-title">
      <h2 id="freeze-title">{t('freeze.title')}</h2>
      <p>{t('freeze.intro')}</p>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !freezes.length ? <p>{t('freeze.none')}</p> : (
        <ul className="plain">{freezes.map((z) => {
          const accounts = JSON.parse(z.accounts) as string[]
          const { reported, released } = z.steps
          return (
            <li key={z.id} className="card" aria-label={t('freeze.to', { addressee: z.addressee })}>
              <h3>{t('freeze.to', { addressee: z.addressee })}</h3>
              <p className="sub">{t('freeze.sent', { date: fmt(z.issued_at) })}</p>
              <ul>{accounts.map((a) => <li key={a}>{a}</li>)}</ul>
              <p>{t('freeze.held', { amount: rupees(z.held_paise) })}</p>
              {reported ? <p><span className="chip c-ok">{t('freeze.reportedChip')}</span> {t('freeze.reported', { reference: reported.reference, date: reported.on_date, name: reported.recorded_by })}</p>
                : <p><span className={`chip ${z.report_due_on < istToday() ? 'c-crit' : 'c-warn'}`}>{t('freeze.reportDue', { date: z.report_due_on })}</span></p>}
              {released && <p><span className="chip c-neu">{t('freeze.releasedChip')}</span> {t('freeze.released', { reference: released.reference, date: released.on_date, reason: released.reason ?? '', name: released.recorded_by })}</p>}
              {!reported && <Form title={t('freeze.recordReport')} submit={step(z.id, 'reported')} onSaved={saved}>
                <label>{t('freeze.onDate')} <input name="onDate" type="date" required max={istToday()} /></label>
                <label>{t('freeze.court')} <input name="reference" required minLength={3} maxLength={200} /></label>
              </Form>}
              {reported && !released && <Form title={t('freeze.recordRelease')} submit={step(z.id, 'released')} onSaved={saved}>
                <label>{t('freeze.onDate')} <input name="onDate" type="date" required max={istToday()} /></label>
                <label>{t('freeze.order')} <input name="reference" required minLength={3} maxLength={200} /></label>
                <label>{t('freeze.reason')} <textarea name="reason" required minLength={10} maxLength={1000} /></label>
              </Form>}
            </li>
          )
        })}</ul>
      )}
    </section>
  )
}
