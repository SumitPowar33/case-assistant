import { type FormEvent, useState } from 'react'
import { ai, send } from './api'
import { officers, type AiEvent, type CaseRef } from './auditAiData'
import { auditCsv, type ExportAnswer } from './auditCsv'
import AuditPaper, { type CasePaper } from './AuditPaper'
import { text } from './formats'
import { useT } from './i18n'

const MOST_PAGES = 50

/** Every AI entry of one FIR, all pages. A file that would be cut short is not made. */
async function allAiEntries(station: string, firId: string): Promise<AiEvent[]> {
  const out: AiEvent[] = []
  for (let page = 0; page < MOST_PAGES; page++) {
    const { events } = await ai<{ events: AiEvent[] }>(`/v1/ai-events?station_id=${station}&fir_id=${firId}&limit=200&offset=${page * 200}`)
    // a new entry between two pages pushes the last one onto the next page too
    out.push(...events.filter((e) => !out.some((o) => o.seq === e.seq)))
    if (events.length < 200) return out
  }
  throw new Error(`More than ${MOST_PAGES * 200} AI entries: the export was not made.`)
}

/** "Export for FIR" (board 20): one case's audit entries as a file or as a court paper, with which court or inquiry asked;
 *  the export is itself kept in the log. The AI's entries are read first, so an export without them is never made or logged. */
export function CaseExport({ station, cases, onDone }: { station: string; cases: CaseRef[]; onDone: () => void }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error?: string; done?: string; withheld?: boolean }>({})
  const [paper, setPaper] = useState<CasePaper | null>(null)
  const firs = cases.filter((c) => c.kind === 'fir')
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firId = text(form, 'fir')
    const reason = text(form, 'reason')
    if (!firId || !reason) return
    const onPaper = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'paper'
    // an earlier paper must not be what gets printed if this export fails
    setBusy(true); setMessage({}); setPaper(null)
    try {
      const entries = await allAiEntries(station, firId)
      const people = await officers(station, entries)
      const answer = (await send<ExportAnswer>('/audit-log/exports', 'POST', { firId, reason }))!
      const at = new Date().toISOString()
      if (onPaper) {
        setPaper({ answer, entries, people, at })
        setTimeout(() => window.print(), 0)
        setMessage({ done: t('auditx.printed', { ref: answer.fir_ref }), withheld: answer.reasons_withheld })
      } else {
        const file = `audit-FIR-${answer.fir_ref.replace('/', '-')}.csv`
        const url = URL.createObjectURL(new Blob([auditCsv(answer, entries, people, at)], { type: 'text/csv;charset=utf-8' }))
        const a = document.createElement('a'); a.href = url; a.download = file; a.click(); URL.revokeObjectURL(url)
        setMessage({ done: t('auditx.saved', { file }), withheld: answer.reasons_withheld })
      }
      onDone()
    } catch (e) {
      setMessage({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  if (firs.length === 0) return null
  return (
    <section>
      <h2>{t('auditx.title')}</h2>
      <p>{t('auditx.intro')}</p>
      <form className="inline" onSubmit={save}>
        <label>{t('auditx.fir')} <select name="fir" required>{firs.map((c) => <option key={c.id} value={c.id}>{t('reads.fir', { ref: c.ref ?? '' })}</option>)}</select></label>{' '}
        <label>{t('auditx.reason')} <input name="reason" required minLength={10} maxLength={500} /></label>{' '}
        <button disabled={busy}>{t('auditx.download')}</button>{' '}
        <button disabled={busy} name="as" value="paper">{t('auditx.print')}</button>
      </form>
      {message.error && <p role="alert">{message.error}</p>}
      {message.done && <p role="status">{message.done}{message.withheld && ` ${t('auditx.withheld')}`}</p>}
      {paper && <AuditPaper paper={paper} />}
    </section>
  )
}
