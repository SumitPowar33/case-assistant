import { useState } from 'react'
import TypingField from './TypingField'
import { send } from './api'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Entry = { at: string; text: string; author_name: string }
type Event = { at: string; what: string; detail: string | null }
type Day = { diary_date: string; page_no: number | null }
type Page = { date: string; today: boolean; page: { page_no: number; closed_at: string; closed_by_name: string } | null; entries: Entry[]; events: Event[]; days: Day[] }

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
const NEEDS = ['diary.need1', 'diary.need2', 'diary.need3', 'diary.need4', 'diary.need5'] as const

/**
 * The case diary under BNSS 192 (design board 14): the day's page with the officer's entries and the steps the app
 * recorded that day, in time order; today's page takes new entries until it is closed. Kept as written (V39).
 */
export default function CaseDiary({ firId }: { firId: string }) {
  const t = useT()
  const [date, setDate] = useState<string>()
  const [version, setVersion] = useState(0)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Page>(`/firs/${firId}/diary${date ? `?date=${date}` : ''}`, version)
  async function act(run: () => Promise<unknown>) {
    setError('')
    try { await run(); setVersion((v) => v + 1) } catch (e) { setError((e as Error).message) }
  }
  if (loadError) return <section><h2>{t('diary.part')}</h2><p role="alert">{loadError}</p></section>
  if (!data) return <section><h2>{t('diary.part')}</h2><p>{t('common.loading')}</p></section>
  // a page without its lists (an older server, a test stub) shows as an empty page rather than breaking the FIR screen
  const list = <T,>(x: T[] | undefined) => (Array.isArray(x) ? x : [])
  const entries = list(data.entries), events = list(data.events), days = list(data.days)
  const lines = [...entries.map((e) => ({ at: e.at, officer: true, text: e.text, by: e.author_name })),
    ...events.map((e) => ({ at: e.at, officer: false, text: t.code('diaryEvent', e.what) + (e.detail ? `: ${e.detail}` : ''), by: '' }))]
    .sort((a, b) => a.at.localeCompare(b.at))
  const open = data.today && !data.page
  return (
    <div className="two-col">
      <section aria-labelledby="diary-day">
        <div className="page-head">
          <h2 id="diary-day">{t('diary.title')} · {data.date}{data.page ? ` · ${t('diary.pageNo', { n: data.page.page_no })}` : ''}</h2>
          <span className={`chip ${data.page ? 'c-ok' : 'c-warn'}`}>{t(data.page ? 'diary.closedChip' : 'diary.openChip')}</span>
        </div>
        <p className="note">{t('diary.lede')}</p>
        {lines.length === 0 ? <p>{t('diary.none')}</p> : <ul className="ingredients">{lines.map((l, i) => (
          <li key={i}><span className="note" style={{ fontVariantNumeric: 'tabular-nums', minWidth: '3rem' }}>{time(l.at)}</span>
            <span className={`chip ${l.officer ? 'c-info' : 'c-neu'}`}>{t(l.officer ? 'diary.officer' : 'diary.fromApp')}</span>
            <div>{l.text}{l.by && <div className="note">{l.by}</div>}</div></li>
        ))}</ul>}
        {data.page && <p role="status" className="chip c-ok">{t('diary.closedBy', { n: data.page.page_no, time: fmt(data.page.closed_at), name: data.page.closed_by_name })}</p>}
        {error && <p role="alert">{error}</p>}
        {open && <form className="record-form" onSubmit={(e) => { e.preventDefault(); void act(async () => { await send(`/firs/${firId}/diary`, 'POST', { text }); setText('') }) }}>
          <TypingField label={t('diary.add')} value={text} onChange={setText} multiline speech />
          <div className="chips">
            <button type="submit">{t('diary.addButton')}</button>
            <button type="button" onClick={() => void act(() => send(`/firs/${firId}/diary/close`, 'POST', {}))}>{t('diary.close')}</button>
          </div>
        </form>}
      </section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section aria-labelledby="diary-needs">
          <h2 id="diary-needs">{t('diary.needs')}</h2>
          <ul>{NEEDS.map((k) => <li key={k}>{t(k)}</li>)}</ul>
        </section>
        <section aria-labelledby="diary-pages">
          <h2 id="diary-pages">{t('diary.earlier')}</h2>
          {days.length === 0 ? <p>{t('diary.none')}</p> : <ul className="ingredients">{days.map((d) => (
            <li key={d.diary_date}>
              <button type="button" onClick={() => setDate(d.diary_date)} aria-pressed={d.diary_date === data.date}>{d.diary_date}{d.page_no ? ` · ${t('diary.pageNo', { n: d.page_no })}` : ''}</button>
              <span className={`chip ${d.page_no ? 'c-ok' : 'c-warn'}`}>{t(d.page_no ? 'diary.closedChip' : 'diary.openChip')}</span>
            </li>
          ))}</ul>}
          {date && <button type="button" onClick={() => setDate(undefined)}>{t('diary.today')}</button>}
        </section>
      </div>
    </div>
  )
}
