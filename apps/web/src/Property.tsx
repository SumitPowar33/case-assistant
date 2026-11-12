import { useState } from 'react'
import { send } from './api'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Item = {
  id: string; fir_id: string; fir_no: number; fir_year: number; label: string; description: string | null; withheld: boolean; station: string
  moved_at: string | null; location: string | null; place: string | null; seal_intact: boolean | null; status: string
}
type Register = { items: Item[]; counts: Record<string, number>; truncated: boolean }
type Move = { at: string; handed_by: string; received_by: string; location: string; purpose: string; seal_intact: boolean; place: string | null }

const STATUS_CHIP: Record<string, string> = { in_malkhana: 'c-ok', out: 'c-info', released: 'c-neu', other: 'c-neu', not_stated: 'c-warn', not_logged: 'c-warn' }
const PLACES = ['malkhana', 'lab', 'court', 'owner', 'other'] as const

/** The hand-overs of one item, oldest first, and the form that adds the next one (the log only grows, V1 and V43). */
function Movements({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Move[]>(`/firs/${item.fir_id}/evidence/${item.id}/custody`, version)
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    try {
      await send(`/firs/${item.fir_id}/evidence/${item.id}/custody`, 'POST', {
        at: new Date().toISOString(), handedBy: v('handedBy'), receivedBy: v('receivedBy'), location: v('location'), purpose: v('purpose'),
        sealIntact: f.get('sealIntact') === 'on', place: v('place'),
      })
      form.reset()
      setVersion((n) => n + 1)
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  const moves = Array.isArray(data) ? data : []
  return (
    <section aria-labelledby="prop-moves">
      <h2 id="prop-moves">{t('prop.moves', { label: item.label })}</h2>
      <p><a href={`#/firs/${item.fir_id}/evidence`}>{t('prop.openCase', { no: item.fir_no, year: item.fir_year })}</a></p>
      {loadError ? <p role="alert">{loadError}</p> : moves.length === 0 ? <p>{t('common.noneYet')}</p> : (
        <div className="table-scroll"><table className="cards">
          <caption>{t('prop.moves', { label: item.label })}</caption>
          <thead><tr>{(['When', 'From', 'To', 'Where', 'Why', 'Seal'] as const).map((c) => <th key={c} scope="col">{t(`prop.col${c}`)}</th>)}</tr></thead>
          <tbody>{moves.map((m, i) => (
            <tr key={i}>
              <td data-label={t('prop.colWhen')}>{m.at.slice(0, 16).replace('T', ' ')}</td><td data-label={t('prop.colFrom')}>{m.handed_by}</td><td data-label={t('prop.colTo')}>{m.received_by}</td>
              <td data-label={t('prop.colWhere')}>{m.location}{m.place ? <div className="sub">{t.code('propPlace', m.place)}</div> : null}</td><td data-label={t('prop.colWhy')}>{m.purpose}</td>
              <td data-label={t('prop.colSeal')}>{m.seal_intact ? t('prop.sealOk') : <span className="chip c-crit">{t('prop.sealBroken')}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {error && <p role="alert">{error}</p>}
      <form className="record-form" onSubmit={(e) => void save(e)}>
        <h3>{t('prop.record')}</h3>
        <label>{t('prop.colFrom')} <input name="handedBy" required maxLength={120} /></label>
        <label>{t('prop.colTo')} <input name="receivedBy" required maxLength={120} /></label>
        <label>{t('prop.colWhere')} <input name="location" required maxLength={200} /></label>
        <label>{t('prop.place')} <select name="place" defaultValue="malkhana">
          {PLACES.map((p) => <option key={p} value={p}>{t.code('propPlace', p)}</option>)}
        </select></label>
        <label>{t('prop.colWhy')} <input name="purpose" required maxLength={200} /></label>
        <label><input name="sealIntact" type="checkbox" defaultChecked /> {t('prop.sealOk')}</label>
        <button type="submit">{t('prop.save')}</button>
      </form>
    </section>
  )
}

/**
 * Case property register (design board 15): the seized physical items of the cases the person may open, with where each
 * is now by its newest hand-over, and the hand-over log of the item picked. The QR label and scanning of the board are
 * not built (no scanner or label printer yet); an item is picked from the list. Counts are of the list, not a mark on anyone.
 */
export default function Property() {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const { data, error } = useLoad<Register>('/property', version)
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  const items = Array.isArray(data.items) ? data.items : []
  const item = items.find((i) => i.id === picked)
  return (
    <>
      <h1>{t('prop.title')}</h1>
      <p className="lede">{t('prop.intro')}</p>
      <p>
        <span className="chip c-ok">{t('prop.countIn', { n: data.counts?.in_malkhana ?? 0 })}</span>{' '}
        <span className="chip c-info">{t('prop.countOut', { n: data.counts?.out ?? 0 })}</span>{' '}
        <span className="chip c-neu">{t('prop.countReleased', { n: data.counts?.released ?? 0 })}</span>
      </p>
      {data.truncated && <p className="note">{t('prop.truncated')}</p>}
      {items.length === 0 ? <p>{t('prop.none')}</p> : (
        <div className="table-scroll"><table className="cards">
          <caption>{t('prop.caption')}</caption>
          <thead><tr>{(['Item', 'Case', 'Place', 'Status'] as const).map((c) => <th key={c} scope="col">{t(`prop.col${c}`)}</th>)}</tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id}>
              <td data-label={t('prop.colItem')}><button type="button" className="btn" aria-pressed={i.id === picked} onClick={() => setPicked(i.id)}>{i.label}</button>
                <div className="sub">{i.withheld ? t('common.withheld') : i.description}</div></td>
              <td data-label={t('prop.colCase')}>{t('fir.title', { no: i.fir_no, year: i.fir_year })}<div className="sub">{i.station}</div></td>
              <td data-label={t('prop.colPlace')}>{i.moved_at ? <>{i.location}<div className="sub">{i.moved_at.slice(0, 10)}</div></> : '—'}
                {i.seal_intact === false && <div><span className="chip c-crit">{t('prop.sealBroken')}</span></div>}</td>
              <td data-label={t('prop.colStatus')}><span className={`chip ${STATUS_CHIP[i.status] ?? 'c-neu'}`}>{t.code('propStatus', i.status)}</span></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {item && <Movements key={item.id} item={item} onSaved={() => setVersion((n) => n + 1)} />}
    </>
  )
}
