import { useContext, useState } from 'react'
import { ai, get } from './api'
import { ScreenLangContext, useT } from './i18n'
import { LANGUAGE_NAMES } from './statementTranslate'
import { BRIEF_PROMPT_VERSION, briefFacts, briefPrompt, readBrief, type Brief, type CaseRow, type Gap } from './supervisorBrief'

type Request = { request_id: string; draft: string; provider: string; model: string }
type Asked = { request: Request; read: Brief; logged?: 'accepted' | 'rejected' }

/**
 * AI briefing on one case of the Supervisor review (AI feature A9, gateway feature supervisor_brief). Only what the table
 * and the readiness check already state goes to the gateway, as numbered facts without any name or text of the file, so
 * it is offered on every case of the supervisor's reach. Each sentence shows the facts it rests on; the supervisor says
 * whether it was useful (logged in the gateway). Nothing is saved in the core, and the table stays the record.
 */
export default function SupervisorBrief({ row, ioLeft }: { row: CaseRow & { id: string }; ioLeft: boolean }) {
  const t = useT()
  const screen = useContext(ScreenLangContext)
  const [language, setLanguage] = useState(screen in LANGUAGE_NAMES ? screen : 'en')
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const title = t('sb.title', { case: t('fir.title', { no: row.fir_no, year: row.fir_year }) })
  const decide = (requestId: string, decision: 'accepted' | 'rejected', why: string) =>
    ai('/v1/decisions', { method: 'POST', body: { request_id: requestId, decision, feature: 'supervisor_brief', case_ref: row.id, note: why } })

  async function brief() {
    setNote('')
    setBusy(true)
    try {
      const { gaps } = await get<{ gaps: Gap[] }>(`/firs/${row.id}/readiness`)
      const facts = briefFacts(row, gaps, ioLeft)
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'supervisor_brief', prompt_version: BRIEF_PROMPT_VERSION, prompt: briefPrompt(facts, language), case_ref: row.id, max_tokens: 800 } })
      const read = readBrief(request.draft, facts)
      const shown = read.kind === 'brief' && read.lines.length > 0
      if (!shown) await decide(request.request_id, 'rejected', 'the briefing was unreadable or had no sentence resting on the facts and was not shown')
      setAsked({ request, read, logged: shown ? undefined : 'rejected' })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function finish(a: Asked, decision: 'accepted' | 'rejected') {
    setNote('')
    try {
      await decide(a.request.request_id, decision, decision === 'accepted' ? 'the supervisor found the briefing useful' : 'the supervisor found the briefing not useful')
      setAsked({ ...a, logged: decision })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <section className="card" aria-label={title}>
      <h2>{title}</h2>
      <label>{t('sb.language')} <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <p><button type="button" onClick={() => void brief()} disabled={busy}>{t(busy ? 'sb.writing' : 'sb.ask')}</button> <small>{t('sb.sends')}</small></p>
      {note && <p role="alert">{note}</p>}
      {asked && (
        <div className="card" aria-label={t('sb.aiPanel')}>
          <p><span className="chip c-ai">{t('sb.aiPanel')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
          {asked.read.kind === 'unreadable' && <p>{t('sb.unreadable')}</p>}
          {asked.read.kind === 'brief' && <>
            {asked.read.lines.length === 0 && <p>{t('sb.empty')}</p>}
            {asked.read.lines.length > 0 && <ul lang={language}>{asked.read.lines.map((l) => (
              <li key={l.text}>{l.text}<div className="sub">{t('sb.from', { list: l.facts.map((f) => f.text).join('; ') })}</div></li>
            ))}</ul>}
            {(asked.read.dropped > 0 || asked.read.opinions > 0) && <p role="note">{t('sb.notShown', { dropped: asked.read.dropped, opinions: asked.read.opinions })}</p>}
            {!asked.logged && <p><button type="button" onClick={() => void finish(asked, 'accepted')}>{t('sb.useful')}</button>{' '}
              <button type="button" onClick={() => void finish(asked, 'rejected')}>{t('sb.notUseful')}</button> <small>{t('sb.check')}</small></p>}
          </>}
          {asked.logged && <p role="status">{t('sb.logged', { decision: t.code('facts.decision', asked.logged) })}</p>}
        </div>
      )}
    </section>
  )
}
