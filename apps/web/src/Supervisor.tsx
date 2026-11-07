import { useLoad } from './useLoad'
import { useT } from './i18n'

type Row = {
  id: string; fir_no: number; fir_year: number; sections: string; io_name: string | null; io_rank: string | null
  deadline_kind: string | null; due_on: string | null; days_left: number | null; open_gaps: number
  report_status: string | null; can_decide: boolean
}
type IoLeft = { id: string; fir_no: number; fir_year: number; io_name: string; io_active: boolean; io_station_name: string | null }
type Queue = { waiting_approval: number; due_in_21_days: number; cases: Row[]; io_left: IoLeft[] }

const STATUS_CHIP: Record<string, string> = { draft: 'c-neu', returned: 'c-warn', submitted: 'c-info', approved: 'c-ok' }

/**
 * Supervisor review (design board 11): the open cases of the supervisor's station or district by nearest deadline, the
 * gaps the readiness check still has open and the final reports waiting for a decision. It states what the files hold;
 * it does not rate an officer or a case. Below, the open cases whose IO was moved to another station or whose account was
 * closed (decision 2(d) of 2 Nov 2026): the old IO no longer reaches them, so they wait here for a new IO. The server decides who may open it (permission chargesheet.approve).
 */
export default function Supervisor() {
  const t = useT()
  const { data, error } = useLoad<Queue>('/supervisor')
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  const kind = (k: string) => k.startsWith('notice_reply:') ? t('deadline.noticeReply', { addressee: k.slice('notice_reply:'.length) }) : t.code('deadline', k)
  const left = (n: number) => n < 0 ? t('dash.overdue', { n: -n }) : n === 0 ? t('dash.today') : t('dash.daysLeft', { n })
  return (
    <>
      <h1>{t('sup.title')}</h1>
      <p className="lede">{t('sup.intro')}</p>
      <p>
        <span className="chip c-info">{t('sup.waiting', { n: data.waiting_approval })}</span>{' '}
        <span className="chip c-warn">{t('sup.due', { n: data.due_in_21_days })}</span>
      </p>
      {data.cases.length === 0 ? <p>{t('sup.none')}</p> : (
        <table>
          <caption>{t('sup.caption')}</caption>
          <thead><tr>
            {(['Case', 'Offence', 'Io', 'Deadline', 'Gaps', 'Report'] as const).map((c) => <th key={c} scope="col">{t(`sup.col${c}`)}</th>)}
            <td />
          </tr></thead>
          <tbody>{data.cases.map((r) => (
            <tr key={r.id}>
              <td>{t('fir.title', { no: r.fir_no, year: r.fir_year })}</td>
              <td>{r.sections}</td>
              <td>{r.io_name ? `${r.io_name} (${r.io_rank})` : t('sup.noIo')}</td>
              <td>{r.due_on && r.deadline_kind && r.days_left !== null
                ? <>{kind(r.deadline_kind)}<div className="sub">{r.due_on} · {left(r.days_left)}</div></> : t('sup.noDeadline')}</td>
              <td>{r.open_gaps > 0 ? <span className="chip c-crit">{r.open_gaps}</span> : t('sup.noGaps')}</td>
              <td>{r.report_status ? <span className={`chip ${STATUS_CHIP[r.report_status] ?? 'c-neu'}`}>{t.code('frStatus', r.report_status)}</span> : t('sup.notStarted')}</td>
              <td><a className="btn" href={`#/firs/${r.id}/finalReport`}>{t('sup.review')}</a></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {data.io_left.length > 0 && (
        <section className="card">
          <h2>{t('sup.ioLeftTitle')}</h2>
          <p>{t('sup.ioLeftIntro')}</p>
          <table>
            <caption className="visually-hidden">{t('sup.ioLeftTitle')}</caption>
            <thead><tr>
              <th scope="col">{t('sup.colCase')}</th><th scope="col">{t('sup.colIoLeft')}</th><td />
            </tr></thead>
            <tbody>{data.io_left.map((r) => (
              <tr key={r.id}>
                <td>{t('fir.title', { no: r.fir_no, year: r.fir_year })}</td>
                <td>{r.io_name}<div className="sub">{!r.io_active ? t('sup.ioClosed') : t('sup.ioMoved', { station: r.io_station_name ?? '—' })}</div></td>
                <td><a className="btn" href={`#/firs/${r.id}/case`}>{t('sup.assignIo')}</a></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  )
}
