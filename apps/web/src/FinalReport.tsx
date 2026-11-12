import { useContext, useState } from 'react'
import NarrativeDraft from './NarrativeDraft'
import TypingField from './TypingField'
import { send } from './api'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'
import { TypingContext } from './typing'

type Draft = { id: string; language: string; facts_text: string; evidence_text: string; status: string; submitted_by: string | null; submitted_by_name: string | null; decided_by_name: string | null; signed_by_name: string | null }
type Event = { at: string; action: string; note: string | null; ai_request: string | null; by_name: string }
type Data = {
  draft: Draft | null; events: Event[]; readinessChecked: boolean; openGaps: number; canApprove: boolean
  particulars: { sections: string; accused: number; witnesses: number; statements_from: number; evidence_items: number }
}

const STATUS_CHIP: Record<string, string> = { draft: 'c-neu', returned: 'c-warn', submitted: 'c-info', approved: 'c-ok', signed: 'c-ok' }

/**
 * Draft and sign the final report under BNSS 193 (design board 10, V41): the officer writes the facts in brief and the
 * evidence, submits once the readiness check has no open gap, the station or district head approves or returns it with
 * a reason, and the officer who submitted it signs. The buttons follow the state of the report; the server decides.
 */
export default function FinalReport({ firId, me, text, victimProtected }: { firId: string; me: string; text: string | null; victimProtected: boolean }) {
  const t = useT()
  const { lang } = useContext(TypingContext)
  const [version, setVersion] = useState(0)
  const [facts, setFacts] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [aiRequest, setAiRequest] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Data>(`/firs/${firId}/final-report`, version)
  if (loadError) return <section><h2>{t('fr.part')}</h2><p role="alert">{loadError}</p></section>
  if (!data) return <section><h2>{t('fr.part')}</h2><p>{t('common.loading')}</p></section>
  const d = data.draft, status = d?.status ?? 'draft'
  const editable = status === 'draft' || status === 'returned'
  const factsText = facts ?? d?.facts_text ?? '', evidenceText = evidence ?? d?.evidence_text ?? ''
  const p = data.particulars ?? { sections: '', accused: 0, witnesses: 0, statements_from: 0, evidence_items: 0 }, events = Array.isArray(data.events) ? data.events : []
  const step = async (write: () => Promise<unknown>) => {
    setError('')
    try {
      await write()
      setFacts(null); setEvidence(null); setReason(''); setAiRequest(null)
      setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }
  const save = () => step(() => send(`/firs/${firId}/final-report`, 'PUT', { language: d?.language ?? lang, facts: factsText, evidence: evidenceText, aiRequestId: aiRequest }))
  const decide = (body: object) => step(() => send(`/firs/${firId}/final-report/decision`, 'POST', body))
  return (
    <div className="two-col">
      <section aria-labelledby="fr-title">
        <h2 id="fr-title">{t('fr.title')}</h2>
        <p className="note">{t('fr.lede')}</p>
        <p>{t('fr.particulars', { sections: p.sections || '—', accused: p.accused, witnesses: p.witnesses, statements: p.statements_from, items: p.evidence_items })}</p>
        <p><span className={`chip ${STATUS_CHIP[status]}`}>{t.code('frStatus', status)}</span>
          {d?.signed_by_name && <> {d.signed_by_name}</>}</p>
        {editable && <NarrativeDraft firId={firId} text={text} victimProtected={victimProtected} sections={p.sections} language={d?.language ?? lang}
          written={{ facts: factsText, evidence: evidenceText }} onTake={(f, e, id) => { setFacts(f); setEvidence(e); setAiRequest(id) }} />}
        {editable ? <form className="record-form" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <TypingField label={t('fr.facts')} value={factsText} onChange={setFacts} multiline />
          <TypingField label={t('fr.evidence')} value={evidenceText} onChange={setEvidence} multiline />
          <button type="submit">{t('fr.save')}</button>
        </form> : <>
          <h3>{t('fr.facts')}</h3><p lang={d?.language} style={{ whiteSpace: 'pre-wrap' }}>{d?.facts_text}</p>
          <h3>{t('fr.evidence')}</h3><p lang={d?.language} style={{ whiteSpace: 'pre-wrap' }}>{d?.evidence_text}</p>
        </>}
        {error && <p role="alert">{error}</p>}
        {editable && d && <>
          {!data.readinessChecked && <p className="note">{t('fr.noPlaybook')}</p>}
          {data.readinessChecked && data.openGaps > 0 && <p className="note">{t('fr.gaps', { count: data.openGaps })}</p>}
          <button type="button" onClick={() => void step(() => send(`/firs/${firId}/final-report/submit`, 'POST', null))}>{t('fr.submit')}</button>
        </>}
        {status === 'submitted' && data.canApprove && d?.submitted_by !== me && <div className="record-form">
          <button type="button" onClick={() => void decide({ decision: 'approve' })}>{t('fr.approve')}</button>
          <TypingField label={t('fr.reason')} value={reason} onChange={setReason} multiline />
          <button type="button" onClick={() => void decide({ decision: 'return', note: reason })}>{t('fr.returnBtn')}</button>
        </div>}
        {status === 'approved' && d?.submitted_by === me && <button type="button" onClick={() => void step(() => send(`/firs/${firId}/final-report/sign`, 'POST', null))}>{t('fr.sign')}</button>}
      </section>
      <section aria-labelledby="fr-history">
        <h2 id="fr-history">{t('fr.history')}</h2>
        <ul className="plain">{events.map((e, i) => (
          <li key={i} className="card">{t('fr.step', { time: fmt(e.at), name: e.by_name, action: t.code('frStatus', e.action) })}
            {e.ai_request && <> <span className="chip c-ai">{t('fr.aiSaved')}</span></>}
            {e.note && <p className="note">{e.note}</p>}</li>
        ))}</ul>
      </section>
    </div>
  )
}
