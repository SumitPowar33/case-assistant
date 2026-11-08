import { useState } from 'react'
import { ai, send } from './api'
import { FACT_PROMPT_VERSION, factPrompt, readFacts, type Fact, type Read } from './factCheck'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Confirmed = { id: string; kind: string; value: string; ai_value: string; corrected: boolean; quote: string; confirmed_at: string; confirmed_by_name: string }
type Draft = { request_id: string; draft: string; provider: string; model: string }
type Choice = 'open' | 'confirmed' | 'wrong'
type Check = { request: Draft; read: Read; choices: Choice[]; values: string[]; logged?: string }

/** The quote with a few words of the text on each side, so the officer sees where it stands. */
function InText({ text, fact }: { text: string; fact: Fact }) {
  const before = text.slice(Math.max(0, fact.at - 50), fact.at), after = text.slice(fact.at + fact.quote.length, fact.at + fact.quote.length + 50)
  return <q>{fact.at > 50 && '…'}{before}<mark className="c-ai">{fact.quote}</mark>{after}{fact.at + fact.quote.length + 50 < text.length && '…'}</q>
}

/**
 * AI fact check of the FIR text (design board 2, AI feature A1). The officer asks the AI gateway (feature fir_extract) for
 * the dates, times, places, amounts and numbers in the text. Only facts whose quote is words of the text are shown, each
 * with where it stands; the officer confirms each (the value can be corrected first) or marks it wrong. Nothing is kept
 * until confirmed (POST /firs/{id}/facts, case team only); finishing the check logs the officer's decision in the gateway.
 * Not offered on a case that protects the victim's identity: its text would go to the AI provider (question for Sumit).
 */
export default function FactCheck({ firId, text, victimProtected }: { firId: string; text: string; victimProtected: boolean }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const { data, error } = useLoad<Confirmed[]>(`/firs/${firId}/facts`, version)
  const confirmed = Array.isArray(data) ? data : []
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function find() {
    setNote('')
    setBusy(true)
    try {
      const request = await ai<Draft>('/v1/generate', { method: 'POST', body: {
        feature: 'fir_extract', prompt_version: FACT_PROMPT_VERSION, prompt: factPrompt(text), case_ref: firId, max_tokens: 1500 } })
      const read = readFacts(request.draft, text)
      const n = read.kind === 'facts' ? read.facts.length : 0
      setCheck({ request, read, choices: Array<Choice>(n).fill('open'), values: read.kind === 'facts' ? read.facts.map((f) => f.value) : [] })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function confirm(c: Check & { read: { kind: 'facts' } }, i: number) {
    setNote('')
    const f = c.read.facts[i]
    try {
      await send(`/firs/${firId}/facts`, 'POST', { kind: f.kind, value: c.values[i].trim(), aiValue: f.value, quote: f.quote, aiRequestId: c.request.request_id })
      setCheck({ ...c, choices: c.choices.map((x, j) => (j === i ? 'confirmed' : x)) })
      setVersion((v) => v + 1)
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  async function finish(c: Check) {
    setNote('')
    const facts = c.read.kind === 'facts' ? c.read.facts : []
    const kept = c.choices.filter((x) => x === 'confirmed').length
    const changed = facts.filter((f, i) => c.choices[i] === 'confirmed' && c.values[i].trim() !== f.value).length
    const wrong = c.choices.filter((x) => x === 'wrong').length
    const decision = !kept ? 'rejected' : changed || kept < facts.length ? 'edited' : 'accepted'
    try {
      await ai('/v1/decisions', { method: 'POST', body: { request_id: c.request.request_id, decision, feature: 'fir_extract', case_ref: firId,
        note: `${kept} confirmed (${changed} corrected), ${wrong} wrong, ${facts.length - kept - wrong} left open` } })
      setCheck({ ...c, logged: decision })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <section aria-labelledby="facts-title">
      <h2 id="facts-title">{t('facts.title')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : confirmed.length ? (
        <ul className="plain">{confirmed.map((f) => (
          <li key={f.id} className="card">
            <span className="chip c-ok">{t.code('facts.kind', f.kind)}</span> <strong>{f.value}</strong>
            {f.corrected && <> <small>{t('facts.correctedFrom', { value: f.ai_value })}</small></>}
            <br /><small>{t('facts.from')} <q>{f.quote}</q> · {t('facts.confirmedBy', { name: f.confirmed_by_name, date: fmt(f.confirmed_at) })}</small>
          </li>
        ))}</ul>
      ) : <p>{t('facts.noneYet')}</p>}
      {victimProtected ? <p role="note">{t('facts.notOnProtected')}</p> : (
        <p><button type="button" onClick={() => void find()} disabled={busy}>{t(busy ? 'facts.reading' : 'facts.find')}</button>{' '}
          <small>{t('facts.sends')}</small></p>
      )}
      {note && <p role="alert">{note}</p>}
      {check && (
        <div className="card" aria-label={t('facts.aiPanel')}>
          <p><span className="chip c-ai">{t('facts.aiPanel')}</span> <small>{check.request.provider} · {check.request.model}</small></p>
          {check.read.kind === 'unreadable' ? <p>{t('facts.unreadable')}</p> : (() => {
            const read = check.read
            const c = check as Check & { read: { kind: 'facts' } }
            return <>
              {!read.facts.length && <p>{t('facts.noneFound')}</p>}
              {read.dropped > 0 && <p><small>{t('facts.dropped', { n: read.dropped })}</small></p>}
              {read.missing.length > 0 && <p><small>{t('facts.missing', { list: read.missing.map((k) => t.code('facts.kind', k)).join(', ') })}</small></p>}
              <ul className="plain">{read.facts.map((f, i) => (
                <li key={i} className="card" aria-label={`${t.code('facts.kind', f.kind)}: ${f.value}`}>
                  <span className="chip c-info">{t.code('facts.kind', f.kind)}</span>{' '}
                  {check.choices[i] === 'open' ? (
                    <label>{t('facts.value')} <input value={check.values[i]} maxLength={200}
                      onChange={(e) => setCheck({ ...check, values: check.values.map((v, j) => (j === i ? e.target.value : v)) })} /></label>
                  ) : <strong>{check.values[i]}</strong>}
                  <br /><small>{t('facts.from')} <InText text={text} fact={f} /></small>
                  <p>{check.choices[i] === 'open' ? <>
                    <button type="button" onClick={() => void confirm(c, i)} disabled={!check.values[i].trim() || !!check.logged}>{t('facts.confirm')}</button>{' '}
                    <button type="button" onClick={() => setCheck({ ...check, choices: check.choices.map((x, j) => (j === i ? 'wrong' : x)) })} disabled={!!check.logged}>{t('facts.wrong')}</button>
                  </> : <span className={`chip ${check.choices[i] === 'confirmed' ? 'c-ok' : 'c-neu'}`}>{t(check.choices[i] === 'confirmed' ? 'facts.confirmed' : 'facts.markedWrong')}</span>}</p>
                </li>
              ))}</ul>
            </>
          })()}
          {check.logged ? <p>{t('facts.logged', { decision: t.code('facts.decision', check.logged) })}</p>
            : <p><button type="button" onClick={() => void finish(check)}>{t('facts.finish')}</button> <small>{t('facts.finishNote')}</small></p>}
        </div>
      )}
    </section>
  )
}
