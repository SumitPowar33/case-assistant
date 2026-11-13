import { useContext, useState } from 'react'
import { ai } from './api'
import { ScreenLangContext, useT } from './i18n'
import { LANGUAGE_NAMES } from './statementTranslate'
import { LETTER_PROMPT_VERSION, STEPS, decisionFor, letterPrompt, readLetter, type Letter, type Step } from './victimLetter'

type Request = { request_id: string; draft: string; provider: string; model: string }
type Asked = { request: Request; read: Letter; text: string; logged?: 'accepted' | 'edited' | 'rejected' }

/**
 * AI draft of the 90-day letter to the victim or informant (AI feature A7, gateway feature victim_update). Only the FIR
 * number, its day and the generic steps the officer ticks go to the gateway: no name and no text of the file, so it is
 * offered on every case, protected ones too. The letter is a draft in the language chosen; the officer reads and changes
 * it, uses or rejects it (the decision is logged in the gateway), sends it by their own means and records the update
 * given in the form below.
 */
export default function VictimLetter({ firId, firNo, firYear, registeredAt }: { firId: string; firNo: number; firYear: number; registeredAt: string }) {
  const t = useT()
  const screen = useContext(ScreenLangContext)
  const [language, setLanguage] = useState(screen in LANGUAGE_NAMES ? screen : 'en')
  const [steps, setSteps] = useState<Step[]>([])
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const facts = { firNo, firYear, registered: new Date(registeredAt), steps }

  async function draft() {
    setNote('')
    setBusy(true)
    try {
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'victim_update', prompt_version: LETTER_PROMPT_VERSION, prompt: letterPrompt(facts, language), case_ref: firId, max_tokens: 800 } })
      const read = readLetter(request.draft, facts)
      setAsked({ request, read, text: read.kind === 'letter' ? read.text : '' })
      if (read.kind !== 'letter') await decide(request.request_id, 'rejected', 'the draft letter was empty or gave an opinion or a promise and was not shown')
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function decide(requestId: string, decision: 'accepted' | 'edited' | 'rejected', why: string) {
    await ai('/v1/decisions', { method: 'POST', body: { request_id: requestId, decision, feature: 'victim_update', case_ref: firId, note: why } })
  }

  async function finish(a: Asked, decision: 'accepted' | 'edited' | 'rejected') {
    setNote('')
    try {
      await decide(a.request.request_id, decision, decision === 'rejected' ? 'the draft letter was not used' : 'the draft letter was used by the officer to inform the victim')
      setAsked({ ...a, logged: decision })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div aria-label={t('vl.title')}>
      <h3>{t('vl.title')}</h3>
      {!asked?.logged && (
        <fieldset>
          <legend>{t('vl.steps')}</legend>
          {STEPS.map((s) => (
            <label key={s}><input type="checkbox" checked={steps.includes(s)} onChange={(e) => setSteps(e.target.checked ? [...steps, s] : steps.filter((x) => x !== s))} /> {t.code('vl.step', s)}</label>
          ))}
          <label>{t('vl.language')} <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <p><button type="button" onClick={() => void draft()} disabled={busy}>{t(busy ? 'vl.writing' : 'vl.draft')}</button> <small>{t('vl.sends')}</small></p>
        </fieldset>
      )}
      {note && <p role="alert">{note}</p>}
      {asked && (
        <div className="card" aria-label={t('vl.aiPanel')}>
          <p><span className="chip c-ai">{t('vl.aiPanel')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
          {asked.read.kind === 'empty' && <p>{t('vl.empty')}</p>}
          {asked.read.kind === 'refused' && <p>{t(asked.read.why === 'opinion' ? 'vl.opinion' : 'vl.promise')}</p>}
          {asked.read.kind === 'letter' && <>
            {asked.read.odd.length > 0 && <p role="note">{t('vl.odd', { list: asked.read.odd.join(', ') })}</p>}
            <textarea aria-label={t('vl.letter')} lang={language} rows={9} value={asked.text} readOnly={!!asked.logged}
              onChange={(e) => setAsked({ ...asked, text: e.target.value })} style={{ width: '100%' }} />
            {asked.logged
              ? <p role="status">{t('vl.logged', { decision: t.code('facts.decision', asked.logged) })}</p>
              : <p><button type="button" onClick={() => void finish(asked, decisionFor(asked.read.kind === 'letter' ? asked.read.text : '', asked.text))}>{t('vl.use')}</button>{' '}
                <button type="button" onClick={() => void finish(asked, 'rejected')}>{t('vl.reject')}</button> <small>{t('vl.useNote')}</small></p>}
          </>}
          {asked.read.kind !== 'letter' && <p role="status">{t('vl.logged', { decision: t.code('facts.decision', 'rejected') })}</p>}
        </div>
      )}
    </div>
  )
}
