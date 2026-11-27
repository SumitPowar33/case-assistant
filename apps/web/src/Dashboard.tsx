import FirList from './FirList'
import { currentSession } from './api'
import { istToday } from './formats'
import { useLoad } from './useLoad'
import { useT, type Key } from './i18n'

type Deadline = { fir_id: string; fir_no: number; fir_year: number; kind: string; due_on: string; basis: string; days_left: number }
type Clash = { officer_id: string; full_name: string; rank: string; on_date: string; kind: string; shift: string | null; post: string | null
  fir_id: string; fir_no: number; fir_year: number }
type Board = { cases: number; due_in_7_days: number; notices_waiting: number; deadlines: Deadline[]; pocso_open?: { fir_id: string; fir_no: number; fir_year: number; open_steps: number }[] }

/** How urgent a deadline is, as a word and a colour (the colour never alone). */
function urgency(daysLeft: number): { chip: string; key: Key } {
  if (daysLeft <= 3) return { chip: 'c-crit', key: 'chip.critical' }
  if (daysLeft <= 7) return { chip: 'c-warn', key: 'chip.action' }
  return { chip: 'c-info', key: 'chip.upcoming' }
}

/**
 * The officer's dashboard (design board 1): the deadlines of the cases they are on the team of, the most urgent first,
 * and their cases. Only what the case files hold; nothing here judges a case or a person.
 */
export default function Dashboard() {
  const t = useT()
  const user = currentSession()?.user
  const { data, error } = useLoad<Board>('/dashboard')
  const kind = (d: Deadline) => d.kind.startsWith('notice_reply:') ? t('deadline.noticeReply', { addressee: d.kind.slice('notice_reply:'.length) }) : t.code('deadline', d.kind)
  const left = (n: number) => n < 0 ? t('dash.overdue', { n: -n }) : n === 0 ? t('dash.today') : t('dash.daysLeft', { n })
  const soon = data?.deadlines.filter((d) => d.days_left <= 14) ?? []
  // item 16: court dates of the next 14 days on a day the case's IO is not on court duty, from the station's duty roster
  // (the server names only cases this officer may open)
  const roster = useLoad<{ court_clashes?: Clash[] }>(user?.station_id ? `/duty-roster?stationId=${user.station_id}` : null)
  const until = istToday(Date.now() + 14 * 86_400_000)
  const clashes = roster.data?.court_clashes?.filter((c) => c.on_date <= until) ?? []
  const entry = (c: Clash) => c.kind === 'duty' ? `${t.code('roster.shift', c.shift ?? '')}, ${t.code('roster.post', c.post ?? '')}` : t.code('roster.kind', c.kind)
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">{new Date().toLocaleDateString(document.documentElement.lang || 'en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h1>{t('dash.welcome', { name: user?.full_name ?? '' })}</h1>
          {data && <p className="lede">{t('dash.summary', { n: data.due_in_7_days })}</p>}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {roster.error && <p role="alert">{roster.error}</p>}
      {data && <>
        <div className="tiles" aria-label={t('nav.dashboard')} role="group">
          <div className="tile"><div>{t('dash.tileCases')}</div><div>{data.cases}</div></div>
          <div className="tile"><div>{t('dash.tileWeek')}</div><div className={data.due_in_7_days ? 'late' : ''}>{data.due_in_7_days}</div></div>
          <div className="tile"><div>{t('dash.tileNotices')}</div><div>{data.notices_waiting}</div></div>
        </div>
        <div className="dash-grid">
          <section className="flush attention" aria-labelledby="attention">
            <h2 id="attention">{t('dash.attention')}</h2>
            {(data.pocso_open ?? []).map((c) => (
              <div className="row" key={c.fir_id}>
                <span className="chip c-crit">{t('chip.critical')}</span>
                <div><strong>{t('fir.title', { no: c.fir_no, year: c.fir_year })} · {t('dash.pocsoOpen', { n: c.open_steps })}</strong></div>
                <a className="btn" href={`#/firs/${c.fir_id}/deadlines`}>{t('dash.open')}</a>
              </div>
            ))}
            {clashes.map((c) => (
              <div className="row" key={`${c.on_date} ${c.officer_id} ${c.fir_id}`}>
                <span className="chip c-warn">{t('chip.action')}</span>
                <div>
                  <strong>{t('dash.courtClash', { fir: `${c.fir_no}/${c.fir_year}`, date: c.on_date })}</strong>
                  <div className="sub">{t('roster.courtOfficer', { officer: `${c.full_name} (${c.rank})`, entry: entry(c) })}</div>
                </div>
                <a className="btn" href="#/roster">{t('dash.open')}</a>
              </div>
            ))}
            {soon.length === 0 && !data.pocso_open?.length && !clashes.length ? <p className="row empty">{t('dash.nothing')}</p> : soon.map((d, i) => {
              const u = urgency(d.days_left)
              return (
                <div className="row" key={i}>
                  <span className={`chip ${u.chip}`}>{t(u.key)}</span>
                  <div>
                    <strong>{t('fir.title', { no: d.fir_no, year: d.fir_year })} · {kind(d)}</strong>
                    <div className="sub">{d.due_on} · {left(d.days_left)} · {d.basis}</div>
                  </div>
                  <a className="btn" href={`#/firs/${d.fir_id}/deadlines`}>{t('dash.open')}</a>
                </div>
              )
            })}
          </section>
          <section className="flush coming" aria-labelledby="upcoming">
            <h2 id="upcoming">{t('dash.upcoming')}</h2>
            {data.deadlines.length === 0 ? <p className="row empty">{t('dash.nothing')}</p> : <ol className="dates">
              {data.deadlines.slice(0, 6).map((d, i) => {
                const day = new Date(d.due_on + 'T00:00:00')
                return (
                  <li key={i}>
                    <div className={`date ${d.days_left <= 3 ? 'crit' : d.days_left <= 7 ? 'warn' : ''}`}>
                      <small>{day.toLocaleDateString(document.documentElement.lang || 'en', { month: 'short' })}</small><b>{day.getDate()}</b>
                    </div>
                    <div><strong>{kind(d)}</strong><div className="sub">{t('fir.title', { no: d.fir_no, year: d.fir_year })} · {left(d.days_left)}</div></div>
                  </li>
                )
              })}
            </ol>}
          </section>
        </div>
      </>}
      <FirList inCard />
      <p className="note">{t('dash.note')}</p>
    </>
  )
}
