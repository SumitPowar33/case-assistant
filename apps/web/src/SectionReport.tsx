import { useState } from 'react'
import { send } from './api'
import { istToday } from './formats'
import { sectionReportDraft, type Added, type FirRef } from './sectionReport'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Sent = { id: string; court: string; sent_on: string; report_text: string; recorded_at: string; recorded_by_name: string; sections: { act: string; section: string }[] }
type Reports = { reports: Sent[]; unreported: Added[]; court: string | null }

const name = (s: { act: string; section: string }) => `${s.act} ${s.section}`

/**
 * The report to the Magistrate on sections added during the investigation (A2, V64). Shown once a section has been added
 * after registration. The draft is built from the case (sectionReportDraft, no AI, no names); the officer chooses the
 * sections, edits the text, sends it to the court and records here the court, the day and the text as sent. Until then
 * each added section is a gap of the readiness check. Case team only; a recorded report is kept as written.
 */
export default function SectionReport({ firId, fir, version, onSaved }: { firId: string; fir: FirRef; version: number; onSaved: () => void }) {
  const t = useT()
  const { data, error } = useLoad<Reports>(`/firs/${firId}/section-reports`, version)
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [court, setCourt] = useState<string | null>(null)
  const [sentOn, setSentOn] = useState(istToday())
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  if (error) return <p role="alert">{error}</p>
  // a stubbed or older answer without the lists shows nothing rather than failing the FIR screen
  const waiting = data?.unreported ?? []
  const sent = data?.reports ?? []
  if (!waiting.length && !sent.length) return null
  const picked = chosen ?? waiting.map(name)
  const courtNow = court ?? data?.court ?? ''
  const sections = waiting.filter((a) => picked.includes(name(a)))

  async function save() {
    setNote('')
    try {
      await send(`/firs/${firId}/section-reports`, 'POST', { court: courtNow.trim(), sentOn, text: text.trim(), sections: sections.map(({ act, section }) => ({ act, section })) })
      setText('')
      setChosen(null)
      setNote(t('sreport.saved'))
      onSaved()
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <section aria-labelledby="sreport-title">
      <h2 id="sreport-title">{t('sreport.title')}</h2>
      {sent.length > 0 && <ul className="plain">{sent.map((r) => (
        <li key={r.id} className="card"><span className="chip c-ok">{r.sections.map(name).join(', ')}</span>{' '}
          <small>{t('sreport.sent', { court: r.court, date: r.sent_on.split('-').reverse().join('.'), name: r.recorded_by_name })}</small>
          <details><summary>{t('sreport.text')}</summary><p style={{ whiteSpace: 'pre-wrap' }}>{r.report_text}</p></details></li>
      ))}</ul>}
      {!waiting.length ? <p>{t('sreport.allReported')}</p> : <>
        <p role="note"><span className="chip c-warn">{t('sreport.waiting', { list: waiting.map(name).join(', ') })}</span></p>
        <p><small>{t('sreport.help')}</small></p>
        <fieldset><legend>{t('sreport.which')}</legend>
          {waiting.map((a) => (
            <label key={name(a)}><input type="checkbox" checked={picked.includes(name(a))}
              onChange={(e) => setChosen(e.target.checked ? [...picked, name(a)] : picked.filter((p) => p !== name(a)))} /> {name(a)}</label>
          ))}
        </fieldset>
        <label>{t('sreport.court')} <input value={courtNow} maxLength={200} onChange={(e) => setCourt(e.target.value)} /></label>{' '}
        <label>{t('sreport.sentOn')} <input type="date" value={sentOn} max={istToday()} onChange={(e) => setSentOn(e.target.value)} /></label>
        <p><button type="button" onClick={() => setText(sectionReportDraft(fir, sections, courtNow, [...waiting, ...sent.flatMap((r) => r.sections)]))} disabled={!sections.length}>{t('sreport.draft')}</button></p>
        <label>{t('sreport.text')} <textarea value={text} maxLength={20000} rows={12} onChange={(e) => setText(e.target.value)} /></label>
        <p><button type="button" onClick={() => void save()} disabled={!sections.length || courtNow.trim().length < 3 || text.trim().length < 40 || !sentOn}>{t('sreport.save')}</button></p>
      </>}
      {note && <p role="alert">{note}</p>}
    </section>
  )
}
