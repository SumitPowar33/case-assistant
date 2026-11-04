import { useState } from 'react'
import { send } from './api'
import { rupees } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Transfer = { id: string; from_account: string; to_account: string; amount_paise: number; transferred_on: string; evidence_label: string | null; to_person: string | null }
type Hold = { id: string; account: string; amount_paise: number; held_on: string; evidence_label: string | null }
type Accused = { person_id: string; label: string | null; name: string | null; received_paise: number; account_holder: boolean; second_links: number; status: string }
type Data = { evidence: { id: string; label: string }[]; transfers: Transfer[]; holds: Hold[]; accused: Accused[]; transferred_paise: number; held_paise: number }

const STATUS_CHIP: Record<string, string> = { both: 'c-ok', money_only: 'c-warn', second_only: 'c-info', none: 'c-neu' }
const who = (a: { label: string | null; name: string | null }) => [a.label, a.name].filter(Boolean).join(' · ')

/**
 * Money trail (design board 8): the transfers and bank holds typed from bank replies already in the evidence register
 * (each can name its reply), and a table of the accused: the money that reached them next to the independent links of
 * the readiness check. It says plainly that money alone is not proof, and gives no score. Rows are kept as written (V42).
 */
export default function MoneyTrail({ firId }: { firId: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Data>(`/firs/${firId}/money-trail`, version)
  if (loadError) return <section><h2>{t('money.part')}</h2><p role="alert">{loadError}</p></section>
  if (!data) return <section><h2>{t('money.part')}</h2><p>{t('common.loading')}</p></section>
  const list = <T,>(x: T[]) => Array.isArray(x) ? x : []
  const evidence = list(data.evidence), transfers = list(data.transfers), holds = list(data.holds), accused = list(data.accused)

  /** Reads the form, sends it with its own literal route and body (the contract tests read both), then clears the form. */
  async function save(e: React.FormEvent<HTMLFormElement>, kind: 'transfer' | 'hold') {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    try {
      if (kind === 'transfer') await send(`/firs/${firId}/money-trail/transfers`, 'POST', { from: v('from'), to: v('to'), toPersonId: v('toPersonId'), amount: Number(v('amount')), date: v('date'), evidenceId: v('evidenceId') })
      else await send(`/firs/${firId}/money-trail/holds`, 'POST', { account: v('account'), amount: Number(v('amount')), date: v('date'), evidenceId: v('evidenceId') })
      form.reset()
      setVersion((n) => n + 1)
    } catch (err) { setError((err as Error).message) }
  }
  const replyField = (
    <label>{t('money.reply')} <select name="evidenceId" defaultValue="">
      <option value="">{t('money.noReply')}</option>
      {evidence.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
    </select></label>
  )
  return (
    <div>
      <section aria-labelledby="money-title">
        <h2 id="money-title">{t('money.title')}</h2>
        <p className="note">{t('money.lede')}</p>
        <p>
          <span className="chip c-info">{t('money.moved', { amount: rupees(data.transferred_paise) })}</span>{' '}
          <span className="chip c-ok">{t('money.frozen', { amount: rupees(data.held_paise) })}</span>
        </p>
        {transfers.length === 0 ? <p>{t('money.noTransfers')}</p> : (
          <div className="table-scroll"><table>
            <caption>{t('money.transfers')}</caption>
            <thead><tr>{(['Date', 'From', 'To', 'Amount', 'Reply'] as const).map((c) => <th key={c} scope="col">{t(`money.col${c}`)}</th>)}</tr></thead>
            <tbody>{transfers.map((r) => (
              <tr key={r.id}>
                <td>{r.transferred_on}</td><td>{r.from_account}</td>
                <td>{r.to_account}{r.to_person && <div className="sub">{r.to_person}</div>}</td>
                <td>{rupees(r.amount_paise)}</td><td>{r.evidence_label ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {holds.length > 0 && (
          <div className="table-scroll"><table>
            <caption>{t('money.holds')}</caption>
            <thead><tr>{(['Date', 'Account', 'Amount', 'Reply'] as const).map((c) => <th key={c} scope="col">{t(`money.col${c}`)}</th>)}</tr></thead>
            <tbody>{holds.map((r) => (
              <tr key={r.id}><td>{r.held_on}</td><td>{r.account}</td><td>{rupees(r.amount_paise)}</td><td>{r.evidence_label ?? '—'}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {error && <p role="alert">{error}</p>}
        <form className="record-form" onSubmit={(e) => void save(e, 'transfer')}>
          <h3>{t('money.newTransfer')}</h3>
          <label>{t('money.from')} <input name="from" required minLength={2} maxLength={120} /></label>
          <label>{t('money.to')} <input name="to" required minLength={2} maxLength={120} /></label>
          <label>{t('money.toPerson')} <select name="toPersonId" defaultValue="">
            <option value="">{t('money.noPerson')}</option>
            {accused.map((a) => <option key={a.person_id} value={a.person_id}>{who(a)}</option>)}
          </select></label>
          <label>{t('money.amount')} <input name="amount" type="number" required min="0.01" step="0.01" inputMode="decimal" /></label>
          <label>{t('money.date')} <input name="date" type="date" required /></label>
          {replyField}
          <button type="submit">{t('money.saveTransfer')}</button>
        </form>
        <form className="record-form" onSubmit={(e) => void save(e, 'hold')}>
          <h3>{t('money.newHold')}</h3>
          <label>{t('money.account')} <input name="account" required minLength={2} maxLength={120} /></label>
          <label>{t('money.amount')} <input name="amount" type="number" required min="0.01" step="0.01" inputMode="decimal" /></label>
          <label>{t('money.date')} <input name="date" type="date" required /></label>
          {replyField}
          <button type="submit">{t('money.saveHold')}</button>
        </form>
      </section>
      <section aria-labelledby="money-links">
        <h2 id="money-links">{t('money.links')}</h2>
        <p className="note">{t('money.linksLede')}</p>
        {accused.length === 0 ? <p>{t('money.noAccused')}</p> : (
          <div className="table-scroll"><table>
            <caption>{t('money.links')}</caption>
            <thead><tr>{(['Accused', 'Money', 'Second', 'Status'] as const).map((c) => <th key={c} scope="col">{t(`money.col${c}`)}</th>)}</tr></thead>
            <tbody>{accused.map((a) => (
              <tr key={a.person_id}>
                <td>{who(a)}</td>
                <td>{a.received_paise > 0 ? t('money.credited', { amount: rupees(a.received_paise) }) : a.account_holder ? t('money.holderOnly') : t('money.noMoney')}</td>
                <td>{a.second_links > 0 ? t('money.linkCount', { n: a.second_links }) : t('money.noSecond')}</td>
                <td><span className={`chip ${STATUS_CHIP[a.status] ?? 'c-neu'}`}>{t.code('moneyStatus', a.status)}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p><a href={`#/firs/${firId}/readiness`}>{t('money.toReadiness')}</a></p>
      </section>
    </div>
  )
}
