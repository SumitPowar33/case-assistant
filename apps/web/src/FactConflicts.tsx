import { useState } from 'react'
import { ai, get, send } from './api'
import { CONFLICT_PROMPT_VERSION, MAX_PROMPT, conflictPrompt, readConflicts, sources, type Conflict, type Source } from './factConflicts'
import { useT } from './i18n'

type Request = { request_id: string; draft: string; provider: string; model: string }
type Passage = { kind: string; title: string; text: string | null }
type Item = { c: Conflict; state: 'open' | 'noted' | 'dismissed' }
type Asked = { request: Request; list: Source[]; items: Item[] | null }

/**
 * "Documents disagree" (design board 2, AI feature A1, gateway feature fact_conflicts), under the fact check of the FIR. The
 * officer asks the AI gateway to compare the FIR text with the case's documents that hold facts (bank and telecom replies, the
 * money trail, evidence, search memos, lab requests: GET /firs/{id}/case-file, read only when asked). A conflict is shown only
 * when both quotes are words of their sources, each holds its value and the values differ; both values are shown and the AI
 * never chooses one. The officer notes it in the case diary (to confirm with the source) or says it is no conflict; either way
 * the decision is logged in the gateway. Nothing else is saved. Not offered on a protected case (FactCheck leaves it out and
 * the gateway refuses the feature).
 */
export default function FactConflicts({ firId, firText }: { firId: string; firText: string }) {
  const t = useT()
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const nameOf = (a: Asked, id: string) => (id === 'FIR' ? t('compare.fir') : a.list.find((s) => s.id === id)!.title)

  async function ask() {
    setNote('')
    setBusy(true)
    try {
      const file = await get<{ passages: Passage[] }>(`/firs/${firId}/case-file`)
      const list = sources(firText, file.passages)
      if (list.length < 2) { setNote(t('conflicts.noDocuments')); setBusy(false); return }
      const prompt = conflictPrompt(list)
      if (prompt.length > MAX_PROMPT) { setNote(t('conflicts.tooLong')); setBusy(false); return }
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'fact_conflicts', prompt_version: CONFLICT_PROMPT_VERSION, prompt, case_ref: firId, max_tokens: 3000 } })
      const read = readConflicts(request.draft, list)
      setAsked({ request, list, items: read.kind === 'conflicts' ? read.conflicts.map((c) => ({ c, state: 'open' as const })) : null })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function decide(a: Asked, i: number, state: 'noted' | 'dismissed') {
    setNote('')
    const c = a.items![i].c
    try {
      if (state === 'noted') {
        await send(`/firs/${firId}/diary`, 'POST', { text: t('conflicts.diaryText', {
          topic: c.topic, a: nameOf(a, c.a.source), va: c.a.value, qa: c.a.quote, b: nameOf(a, c.b.source), vb: c.b.value, qb: c.b.quote }) })
      }
      await ai('/v1/decisions', { method: 'POST', body: { request_id: a.request.request_id, decision: state === 'noted' ? 'accepted' : 'rejected', feature: 'fact_conflicts', case_ref: firId,
        note: state === 'noted' ? 'conflict noted in the case diary' : 'not a conflict' } })
      setAsked({ ...a, items: a.items!.map((x, j) => (j === i ? { ...x, state } : x)) })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div className="card" aria-label={t('conflicts.title')}>
      <h3>{t('conflicts.title')}</h3>
      {!asked && <p><button type="button" onClick={() => void ask()} disabled={busy}>{t(busy ? 'compare.asking' : 'conflicts.ask')}</button>{' '}<small>{t('conflicts.sends')}</small></p>}
      {note && <p role="alert">{note}</p>}
      {asked && <>
        <p><span className="chip c-ai">{t('conflicts.title')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
        {(!asked.items || asked.items.length === 0) ? <p>{t('conflicts.none')}</p> : <ul className="plain">{asked.items.map((x, i) => (
          <li key={i} className="card">
            <strong>{x.c.topic}</strong> <span className="chip c-crit">{t('conflicts.chip')}</span>
            {[x.c.a, x.c.b].map((s) => <p key={s.source}><span className="chip c-neu">{nameOf(asked, s.source)}</span> <strong>{s.value}</strong> <small><q>{s.quote}</q></small></p>)}
            {x.state === 'open' ? <p>
              <button type="button" onClick={() => void decide(asked, i, 'noted')}>{t('conflicts.note')}</button>{' '}
              <button type="button" onClick={() => void decide(asked, i, 'dismissed')}>{t('conflicts.dismiss')}</button></p>
              : <p role="status"><small>{t(x.state === 'noted' ? 'compare.noted' : 'compare.dismissed')}</small></p>}
          </li>
        ))}</ul>}
      </>}
    </div>
  )
}
