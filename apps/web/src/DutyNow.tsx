import { useT } from './i18n'
import { useLoad } from './useLoad'

type Officer = { id: string; full_name: string; rank: string; post: string | null }

/**
 * Who is on duty now, from the station's duty roster (item 16): all posts on the front desk; beat and patrol on the 112
 * screen. A list only; it sends nobody anywhere.
 */
export default function DutyNow({ station, beat = false }: { station: string; beat?: boolean }) {
  const t = useT()
  const { data, error } = useLoad<{ now?: { shift: string; on_duty: Officer[] } }>(`/duty-roster?stationId=${station}`)
  if (error) return <p role="alert">{error}</p>
  if (!data?.now) return null
  const on = data.now.on_duty.filter((o) => !beat || o.post === 'beat' || o.post === 'patrol')
  return (
    <section aria-labelledby="duty-now">
      <h2 id="duty-now">{t(beat ? 'roster.nowBeat' : 'roster.now', { shift: t.code('roster.shift', data.now.shift) })}</h2>
      {on.length === 0 ? <p>{t(beat ? 'roster.nobodyBeat' : 'roster.nobody')}</p>
        : <ul className="plain">{on.map((o, i) => <li key={i}>{o.full_name} ({o.rank}): {t.code('roster.post', o.post ?? '')}</li>)}</ul>}
      <p className="note"><a href="#/roster">{t('nav.roster')}</a></p>
    </section>
  )
}
