import { useContext, useState, type FormEvent } from 'react'
import { ai, get, send } from './api'
import { fmt } from './formats'
import { ScreenLangContext, useT } from './i18n'
import { useLoad } from './useLoad'
import { CDR_PROMPT_VERSION, cdrPrompt, cdrRows, readSummary, type CdrFile, type Common, type Summary } from './cdrSummary'

type Item = { id: string; label: string; kind: string }
type Analysis = { files: CdrFile[]; common: Common[] }

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Call records (CdrController). Loading: the operator's file, checked against the SHA-256 of the electronic evidence item
 * it was seized as. Analysis: shown only when asked for, because each view is logged (the records hold numbers of people
 * outside the case). The AI summary gets only the tables' rows and keeps only sentences that name them.
 */
export default function Cdr({ firId }: { firId: string }) {
  const t = useT()
  const lang = useContext(ScreenLangContext)
  const items = useLoad<Item[]>(`/firs/${firId}/evidence`)
  const electronic = (Array.isArray(items.data) ? items.data : []).filter((e) => e.kind === 'electronic')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<Analysis | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  async function load(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const file = (form.elements.namedItem('file') as HTMLInputElement).files?.[0]
    if (!file || !file.size) return
    setBusy(true)
    setNote('')
    try {
      const out = await send<{ lines: number; skipped: number; problems: string[] }>(`/firs/${firId}/cdr`, 'POST', {
        evidenceItemId: f.get('item'), target: f.get('target'), filename: file.name, contentBase64: base64(await file.arrayBuffer()) })
      setNote([t('cdr.loaded', { lines: out?.lines ?? 0, skipped: out?.skipped ?? 0 }), ...(out?.problems ?? [])].join(' '))
      form.reset()
      if (data) await show()
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function show() {
    setNote('')
    setSummary(null)
    try { setData(await get<Analysis>(`/firs/${firId}/cdr`)) } catch (err) { setNote((err as Error).message) }
  }

  async function summarise() {
    if (!data) return
    setBusy(true)
    setNote('')
    const rows = cdrRows(data.files, data.common)
    try {
      const out = await ai<{ draft: string }>('/v1/generate', { method: 'POST', body: {
        feature: 'cdr_summary', prompt_version: CDR_PROMPT_VERSION, prompt: cdrPrompt(rows, lang), case_ref: firId, max_tokens: 900 } })
      setSummary(readSummary(out.draft, rows))
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  const who = (n: string, person: string | null) => (person ? `${n} (${person})` : n)
  return (
    <section aria-labelledby="cdr-title">
      <h2 id="cdr-title">{t('cdr.part')}</h2>
      <p className="lede">{t('cdr.lede')}</p>
      <details>
        <summary>{t('cdr.load')}</summary>
        {items.error ? <p role="alert">{items.error}</p> : !electronic.length ? <p>{t('cdr.noItem')}</p> : (
          <form className="record-form" onSubmit={load}>
            <label>{t('cdr.item')} <select name="item" required>{electronic.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
            <label>{t('cdr.target')} <input name="target" required inputMode="tel" maxLength={20} /></label>
            <label>{t('cdr.file')} <input name="file" type="file" accept=".csv,text/csv,text/plain" required /></label>
            <p className="sub">{t('cdr.checkNote')}</p>
            <button type="submit" disabled={busy}>{t(busy ? 'cdr.busy' : 'cdr.submit')}</button>
          </form>
        )}
      </details>
      {note && <p role="status">{note}</p>}
      {!data ? <p><button type="button" onClick={show}>{t('cdr.show')}</button> <small>{t('cdr.logged')}</small></p>
        : !data.files.length ? <p>{t('cdr.none')}</p> : <>
          {data.files.map((f) => (
            <section key={f.id} className="card" aria-label={t('cdr.fileTitle', { evidence: f.evidence, target: who(f.target, f.target_person) })}>
              <h3>{t('cdr.fileTitle', { evidence: f.evidence, target: who(f.target, f.target_person) })}</h3>
              <p className="sub">{t('cdr.fileMeta', { lines: f.lines, from: fmt(f.first_at), to: fmt(f.last_at), name: f.loaded_by })}</p>
              <table className="cards">
                <caption>{t('cdr.contacts')}</caption>
                <thead><tr><th scope="col">{t('cdr.colNumber')}</th><th scope="col">{t('cdr.colCalls')}</th><th scope="col">{t('cdr.colSeconds')}</th><th scope="col">{t('cdr.colSms')}</th><th scope="col">{t('cdr.colFirst')}</th><th scope="col">{t('cdr.colLast')}</th></tr></thead>
                <tbody>{f.contacts.map((c) => (
                  <tr key={c.other}><th scope="row">{who(c.other, c.person)}</th><td data-label={t('cdr.colCalls')}>{c.calls}</td><td data-label={t('cdr.colSeconds')}>{c.seconds}</td>
                    <td data-label={t('cdr.colSms')}>{c.sms}</td><td data-label={t('cdr.colFirst')}>{fmt(c.first_at)}</td><td data-label={t('cdr.colLast')}>{fmt(c.last_at)}</td></tr>
                ))}</tbody>
              </table>
              {f.cells.length > 0 && <table className="cards">
                <caption>{t('cdr.cells')}</caption>
                <thead><tr><th scope="col">{t('cdr.colCell')}</th><th scope="col">{t('cdr.colEvents')}</th><th scope="col">{t('cdr.colFirst')}</th><th scope="col">{t('cdr.colLast')}</th></tr></thead>
                <tbody>{f.cells.map((c) => (
                  <tr key={c.cell}><th scope="row">{c.cell}</th><td data-label={t('cdr.colEvents')}>{c.events}</td><td data-label={t('cdr.colFirst')}>{fmt(c.first_at)}</td><td data-label={t('cdr.colLast')}>{fmt(c.last_at)}</td></tr>
                ))}</tbody>
              </table>}
              <h4>{t('cdr.days')}</h4>
              <ul className="cdr-days">{f.days.map((d) => <li key={d.day}><span className="chip c-neu">{d.day}: {d.events}</span></li>)}</ul>
            </section>
          ))}
          <section className="card" aria-labelledby="cdr-common">
            <h3 id="cdr-common">{t('cdr.common')}</h3>
            {!data.common.length ? <p>{t('cdr.commonNone')}</p> : <table className="cards">
              <thead><tr><th scope="col">{t('cdr.colNumber')}</th><th scope="col">{t('cdr.colFiles')}</th><th scope="col">{t('cdr.colEvents')}</th></tr></thead>
              <tbody>{data.common.map((c) => (
                <tr key={c.number}><th scope="row">{who(c.number, c.person)}</th><td data-label={t('cdr.colFiles')}>{c.targets.join(', ')}</td><td data-label={t('cdr.colEvents')}>{c.events}</td></tr>
              ))}</tbody>
            </table>}
          </section>
          <section className="ai-draft" aria-label={t('cdr.draft')}>
            <p><button type="button" onClick={summarise} disabled={busy}>{t(busy ? 'cdr.summarising' : 'cdr.summarise')}</button> <small>{t('cdr.sends')}</small></p>
            {summary && <>
              <p><span className="chip c-ai">{t('cdr.draft')}</span></p>
              <ul className="plain">{summary.sentences.map((s, i) => <li key={i}>{s.text} {s.rows.map((r) => <span key={r.tag} className="chip c-info" title={r.text}>{r.tag}</span>)}</li>)}</ul>
              {summary.dropped > 0 && <p className="sub">{t('cdr.dropped', { n: summary.dropped })}</p>}
            </>}
          </section>
        </>}
    </section>
  )
}
