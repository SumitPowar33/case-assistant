import { useState } from 'react'
import { ai, send } from './api'
import { COMPARE_PROMPT_VERSION, MAX_PROMPT, comparePrompt, readDifferences, type Difference, type Source } from './statementCompare'
import { useT } from './i18n'

type Request = { request_id: string; draft: string; provider: string; model: string }
type Item = { d: Difference; state: 'open' | 'noted' | 'dismissed' }
type Asked = { request: Request; items: Item[] | null }
type Stmt = { id: string; name: string | null; label: string | null; original_text: string }

/**
 * "Differences to clarify" (design board 6, AI feature A3, gateway feature statement_compare). The officer asks the AI
 * gateway to compare the FIR text with the statements of the case (no names are sent: sources are FIR, S1, S2 ...). A
 * difference is shown only when both quotes are words of the two sources it names. For each one the officer notes it in the
 * case diary (to ask the witness) or says it is not a difference; either way the decision is logged in the gateway. The AI
 * never says which source is right. Not offered on a protected case or for a masked person's statement (the screen leaves
 * those out and the gateway refuses the feature on a protected case).
 */
export default function StatementCompare({ firId, firText, statements }: { firId: string; firText: string; statements: Stmt[] }) {
  const t = useT()
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const sources: Source[] = [...(firText ? [{ id: 'FIR', text: firText }] : []), ...statements.map((s, i) => ({ id: `S${i + 1}`, text: s.original_text }))]
  if (sources.length < 2) return null
  const nameOf = (id: string) => (id === 'FIR' ? t('compare.fir') : (() => {
    const s = statements[Number(id.slice(1)) - 1]
    return [s.label, s.name].filter(Boolean).join(' · ') || id
  })())
  const prompt = comparePrompt(sources)

  async function ask() {
    setNote('')
    if (prompt.length > MAX_PROMPT) { setNote(t('compare.tooLong')); return }
    setBusy(true)
    try {
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'statement_compare', prompt_version: COMPARE_PROMPT_VERSION, prompt, case_ref: firId, max_tokens: 3000 } })
      const read = readDifferences(request.draft, sources)
      setAsked({ request, items: read.kind === 'differences' ? read.differences.map((d) => ({ d, state: 'open' as const })) : null })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function decide(a: Asked, i: number, state: 'noted' | 'dismissed') {
    setNote('')
    const d = a.items![i].d
    try {
      if (state === 'noted') {
        await send(`/firs/${firId}/diary`, 'POST', { text: t('compare.diaryText', { topic: d.topic, a: nameOf(d.a.source), qa: d.a.quote, b: nameOf(d.b.source), qb: d.b.quote }) })
      }
      await ai('/v1/decisions', { method: 'POST', body: { request_id: a.request.request_id, decision: state === 'noted' ? 'accepted' : 'rejected', feature: 'statement_compare', case_ref: firId,
        note: state === 'noted' ? 'difference noted in the case diary' : 'not a difference' } })
      setAsked({ ...a, items: a.items!.map((x, j) => (j === i ? { ...x, state } : x)) })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div className="card" aria-label={t('compare.title')}>
      <h3>{t('compare.title')}</h3>
      {!asked && <p><button type="button" onClick={() => void ask()} disabled={busy}>{t(busy ? 'compare.asking' : 'compare.ask')}</button>{' '}<small>{t('compare.sends')}</small></p>}
      {note && <p role="alert">{note}</p>}
      {asked && <>
        <p><span className="chip c-ai">{t('compare.title')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
        {(!asked.items || asked.items.length === 0) ? <p>{t('compare.none')}</p> : <ul className="plain">{asked.items.map((x, i) => (
          <li key={i} className="card">
            <strong>{x.d.topic}</strong>
            {[x.d.a, x.d.b].map((s) => <p key={s.source}><span className="chip c-neu">{nameOf(s.source)}</span> <q>{s.quote}</q></p>)}
            {x.state === 'open' ? <p>
              <button type="button" onClick={() => void decide(asked, i, 'noted')}>{t('compare.note')}</button>{' '}
              <button type="button" onClick={() => void decide(asked, i, 'dismissed')}>{t('compare.dismiss')}</button></p>
              : <p role="status"><small>{t(x.state === 'noted' ? 'compare.noted' : 'compare.dismissed')}</small></p>}
          </li>
        ))}</ul>}
      </>}
    </div>
  )
}
