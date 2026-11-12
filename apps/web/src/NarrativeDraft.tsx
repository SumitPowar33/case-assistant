import { useState } from 'react'
import { ai, get } from './api'
import { DRAFT_PROMPT_VERSION, PARTS, appendTo, decisionFor, draftPrompt, readDraft, type DraftRead, type Sentence, type Source } from './chargesheetDraft'
import { useT } from './i18n'

type Statement = { id: string; label: string | null; name: string | null; masked: boolean; recorded_at: string; original_text: string; translated_text: string | null }
type Request = { request_id: string; draft: string; provider: string; model: string }
type Asked = { request: Request; read: DraftRead; ticked: boolean[]; logged?: string; taken?: number }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })

/**
 * AI draft of the final report's narrative (AI feature A6, board 10, plan section 7). The officer asks the AI gateway
 * (feature chargesheet_draft) to draft the facts in brief and the evidence from the FIR text and the statements (with
 * their checked English translations). A sentence is shown only with the words of the piece it rests on; one that gives
 * an opinion on guilt, truthfulness or proof is not shown. The officer ticks the sentences to take: they are added after
 * the officer's own words with their source, the decision is logged in the gateway, and the officer reads, rewrites and
 * saves (the save names the request). Not offered on a case that protects the victim's identity, nor from the statement
 * of a masked person.
 */
export default function NarrativeDraft({ firId, text, victimProtected, sections, language, written, onTake }: {
  firId: string; text: string | null; victimProtected: boolean; sections: string; language: string
  written: { facts: string; evidence: string }; onTake: (facts: string, evidence: string, requestId: string) => void
}) {
  const t = useT()
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const cite = (s: Source) => (s.kind === 'fir' ? t('csd.cite.fir')
    : t(s.kind === 'statement' ? 'csd.cite.statement' : 'csd.cite.translation', { who: s.who ?? '—', date: day(s.date!) }))

  if (victimProtected) return <p role="note">{t('csd.notOnProtected')}</p>

  async function draft() {
    setNote('')
    setBusy(true)
    try {
      const { statements } = await get<{ statements: Statement[] }>(`/firs/${firId}/statements`)
      const sources: Source[] = text ? [{ id: 'FIR', kind: 'fir', who: null, date: null, text }] : []
      statements.filter((s) => !s.masked).forEach((s, i) => {
        const who = s.label ?? s.name
        sources.push({ id: `S${i + 1}`, kind: 'statement', who, date: s.recorded_at, text: s.original_text })
        if (s.translated_text) sources.push({ id: `T${i + 1}`, kind: 'translation', who, date: s.recorded_at, text: s.translated_text })
      })
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'chargesheet_draft', prompt_version: DRAFT_PROMPT_VERSION, prompt: draftPrompt(sources, sections, language), case_ref: firId, max_tokens: 4000 } })
      const read = readDraft(request.draft, sources)
      setAsked({ request, read, ticked: Array<boolean>(read.kind === 'sentences' ? read.sentences.length : 0).fill(false) })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function take(a: Asked) {
    setNote('')
    const all = a.read.kind === 'sentences' ? a.read.sentences : []
    const kept: Sentence[] = all.filter((_, i) => a.ticked[i])
    const decision = decisionFor(a.read, kept.length)
    try {
      await ai('/v1/decisions', { method: 'POST', body: { request_id: a.request.request_id, decision, feature: 'chargesheet_draft', case_ref: firId,
        note: `${kept.length} of ${all.length} drafted sentences taken into the final report for the officer to rewrite` } })
      setAsked({ ...a, logged: decision, taken: kept.length })
      if (kept.length) onTake(appendTo(written.facts, kept, 'facts', cite), appendTo(written.evidence, kept, 'evidence', cite), a.request.request_id)
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div aria-label={t('csd.title')}>
      <h3>{t('csd.title')}</h3>
      {!asked?.logged && <p><button type="button" onClick={() => void draft()} disabled={busy}>{t(busy ? 'csd.reading' : 'csd.draft')}</button>{' '}
        <small>{t('csd.sends')}</small></p>}
      {note && <p role="alert">{note}</p>}
      {asked && (
        <div className="card" aria-label={t('csd.aiPanel')}>
          <p><span className="chip c-ai">{t('csd.aiPanel')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
          {asked.read.kind === 'unreadable' ? <p>{t('csd.unreadable')}</p> : (() => {
            const read = asked.read
            return <>
              <p><small>{t('csd.caution')}</small></p>
              {!read.sentences.length && <p>{t('csd.noneFound')}</p>}
              {read.dropped > 0 && <p><small>{t('csd.dropped', { n: read.dropped })}</small></p>}
              {read.opinions > 0 && <p><small>{t('csd.opinions', { n: read.opinions })}</small></p>}
              {PARTS.filter((part) => read.sentences.some((s) => s.part === part)).map((part) => (
                <fieldset key={part}><legend>{t(part === 'facts' ? 'fr.facts' : 'fr.evidence')}</legend>
                  <ul className="plain">{read.sentences.map((s, i) => s.part !== part ? null : (
                    <li key={i}><label><input type="checkbox" checked={asked.ticked[i]} disabled={!!asked.logged}
                      onChange={(e) => setAsked({ ...asked, ticked: asked.ticked.map((x, j) => (j === i ? e.target.checked : x)) })} /> <span lang={language}>{s.text}</span></label>
                      <br /><small>{t('csd.from', { source: cite(s.source) })} <q><mark className="c-ai">{s.quote}</mark></q></small></li>
                  ))}</ul>
                </fieldset>
              ))}
            </>
          })()}
          {asked.logged ? <p role="status">{t('csd.taken', { decision: t.code('facts.decision', asked.logged), n: asked.taken! })}</p>
            : <p><button type="button" onClick={() => void take(asked)}>{t('csd.take')}</button> <small>{t('facts.finishNote')}</small></p>}
        </div>
      )}
    </div>
  )
}
