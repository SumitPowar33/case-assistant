import { useState, type FormEvent } from 'react'
import { ai, send } from './api'
import { ASK_PROMPT_VERSION, askPrompt, checkAnswer, refusal, retrieve, type Checked, type Passage, type Refusal } from './askFile'
import { loadVectors } from './askVectors'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Draft = { request_id: string; draft: string; provider: string; model: string }
type Turn =
  | { id: number; q: string; refused: Refusal }
  | { id: number; q: string; none: true }
  | { id: number; q: string; answer: Checked; request: Draft; decided?: 'accepted' | 'rejected'; wordsOnly?: boolean }

const REASON = { guilt: 'ask.refusedGuilt', truth: 'ask.refusedTruth', predict: 'ask.refusedPredict' } as const

/**
 * Ask the case file (design board 19, AI feature A5). The officer asks about this one case. A question about guilt, truth or
 * what someone will do is refused here, before anything is sent. Otherwise the passages of this case that share words with
 * the question are found (GET /firs/{id}/case-file, case team only), and only those go to the AI gateway (feature case_qa).
 * No passage found: "not in the file", with no AI call. The answer must cite the passages it uses; the screen shows exactly
 * those, and marks an answer that cites none. The officer's verdict (useful or wrong) is logged by the gateway.
 */
/** The whole passage a source piece comes from, with the piece marked, so the officer can read what is around it. */
function Whole({ passage, quote, label }: { passage?: Passage; quote: string; label: string }) {
  if (!passage) return null
  const at = passage.text.indexOf(quote)
  return (
    <details>
      <summary>{label}</summary>
      <pre>{at < 0 ? passage.text : <>{passage.text.slice(0, at)}<mark>{quote}</mark>{passage.text.slice(at + quote.length)}</>}</pre>
    </details>
  )
}

export default function AskCaseFile({ firId }: { firId: string }) {
  const t = useT()
  const { data, error } = useLoad<{ passages: Passage[] }>(`/firs/${firId}/case-file`)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [diary, setDiary] = useState<{ id: number; text: string; saved?: boolean } | null>(null)   // the diary note being written for one answer
  const passages = Array.isArray(data?.passages) ? data.passages : []

  async function ask(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q.length < 3 || busy) return
    setNote('')
    const id = turns.length + 1
    const why = refusal(q)
    if (why) {
      setTurns([{ id, q, refused: why }, ...turns]); setQuestion('')
      // the question alone (no piece of the file) goes to the gateway, which refuses it too and keeps the refusal in its log
      ai('/v1/generate', { method: 'POST', body: {
        feature: 'case_qa', prompt_version: ASK_PROMPT_VERSION, prompt: askPrompt(q, []), case_ref: firId, max_tokens: 700 } }).catch(() => {})
      return
    }
    setBusy(true)
    // the meaning search (embedding model on the state's server); without it the pieces are found by words alone
    const vectors = await loadVectors(firId, q, passages)
    const sources = retrieve(q, passages, 6, vectors ?? undefined)
    if (!sources.length) { setTurns([{ id, q, none: true }, ...turns]); setQuestion(''); setBusy(false); return }
    try {
      const out = await ai<Draft>('/v1/generate', { method: 'POST', body: {
        feature: 'case_qa', prompt_version: ASK_PROMPT_VERSION, prompt: askPrompt(q, sources), case_ref: firId, max_tokens: 700 } })
      setTurns([{ id, q, answer: checkAnswer(out.draft, sources), request: out, wordsOnly: !vectors }, ...turns])
      setQuestion('')
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function decide(turn: Turn & { request: Draft }, decision: 'accepted' | 'rejected') {
    setNote('')
    try {
      await ai('/v1/decisions', { method: 'POST', body: { request_id: turn.request.request_id, decision, feature: 'case_qa', case_ref: firId } })
      setTurns((all) => all.map((x) => (x.id === turn.id ? { ...turn, decided: decision } : x)))
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  function startNote(x: Turn & { answer: Checked }) {
    setNote('')
    setDiary({ id: x.id, text: [`${t('ask.noteQuestion')}: ${x.q}`, `${t('ask.noteAnswer')}: ${x.answer.text}`,
      `${t('ask.sources')}: ${x.answer.sources.map((s) => `${s.tag} ${s.title}`).join('; ')}`].join('\n') })
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault()
    if (!diary) return
    try {
      await send(`/firs/${firId}/diary`, 'POST', { text: diary.text.trim() })
      setDiary({ ...diary, saved: true })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <section aria-labelledby="ask-title">
      <h2 id="ask-title">{t('ask.title')}</h2>
      <p>{t('ask.lede')}</p>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : (
        <form onSubmit={ask}>
          <label>{t('ask.question')} <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} /></label>{' '}
          <button type="submit" disabled={busy || question.trim().length < 3}>{t(busy ? 'ask.asking' : 'ask.ask')}</button>
          <p><small>{t('ask.sends')}</small></p>
        </form>
      )}
      {note && <p role="alert">{note}</p>}
      {turns.map((x) => (
        <article key={x.id} className="card" aria-label={x.q}>
          <p><strong>{x.q}</strong></p>
          {'refused' in x ? <p role="note">{t(REASON[x.refused])}</p>
            : 'none' in x ? <p><span className="chip c-neu">{t('ask.notInFile')}</span> {t('ask.noPassage')}</p>
            : (
              <>
                <section aria-label={t('ask.draft')} className="ai-draft">
                  <p><span className="chip c-ai">{t('ask.draft')}</span>{' '}
                    {x.answer.kind === 'notInFile' && <span className="chip c-neu">{t('ask.notInFile')}</span>}
                    {x.answer.kind === 'unsourced' && <span className="chip c-warn">{t('ask.unsourced')}</span>}
                    {x.wordsOnly && <> <span className="chip c-neu">{t('ask.wordsOnly')}</span></>}</p>
                  <pre>{x.answer.text}</pre>
                  {x.answer.sources.length > 0 && (
                    <>
                      <h3>{t('ask.sources')}</h3>
                      <ul className="plain">{x.answer.sources.map((s) => (
                        <li key={s.tag}><span className="chip c-info">{s.tag}</span> <strong>{s.title}</strong> <q>{s.quote}</q>
                          <Whole passage={passages.find((p) => p.id === s.passageId)} quote={s.quote} label={t('ask.fullPassage')} /></li>
                      ))}</ul>
                    </>
                  )}
                </section>
                {x.answer.kind === 'found' && (diary?.id === x.id ? (
                  diary.saved ? <p role="status"><small>{t('ask.noteSaved')}</small></p> : (
                    <form onSubmit={saveNote}>
                      <label>{t('ask.noteLabel')} <textarea value={diary.text} onChange={(e) => setDiary({ ...diary, text: e.target.value })} rows={6} maxLength={5000} /></label>{' '}
                      <button type="submit" disabled={diary.text.trim().length < 3}>{t('ask.noteSave')}</button>{' '}
                      <button type="button" onClick={() => setDiary(null)}>{t('ask.noteCancel')}</button>
                    </form>
                  )
                ) : <p><button type="button" onClick={() => startNote(x as Turn & { answer: Checked })}>{t('ask.noteDiary')}</button></p>)}
                {x.decided ? <p><small>{t(x.decided === 'accepted' ? 'ask.keptLogged' : 'ask.wrongLogged')}</small></p> : (
                  <p>
                    <button type="button" onClick={() => decide(x, 'accepted')}>{t('ask.useful')}</button>{' '}
                    <button type="button" onClick={() => decide(x, 'rejected')}>{t('ask.wrong')}</button>
                  </p>
                )}
              </>
            )}
        </article>
      ))}
    </section>
  )
}
