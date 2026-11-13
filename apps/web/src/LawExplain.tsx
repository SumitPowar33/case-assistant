import { useContext, useState } from 'react'
import { ai } from './api'
import { ScreenLangContext, useT } from './i18n'
import { EXPLAIN_PROMPT_VERSION, explainPrompt, readExplanation, type Entry, type Explained } from './lawExplain'
import { LANGUAGE_NAMES } from './statementTranslate'

type Request = { request_id: string; draft: string; provider: string; model: string }
type Asked = { request: Request; read: Explained; logged?: 'accepted' | 'rejected' }

/**
 * AI explanation of one row of the law finder (AI feature A8, gateway feature law_explain). The table stays the answer;
 * the AI only explains it in plain words, in the language chosen. Only the two section numbers and the table's own short
 * description go to the gateway: nothing from any case. The officer says whether it helped (logged in the gateway).
 */
export default function LawExplain({ entry }: { entry: Entry }) {
  const t = useT()
  const screen = useContext(ScreenLangContext)
  const [language, setLanguage] = useState(screen in LANGUAGE_NAMES ? screen : 'en')
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const old = `${entry.law} ${entry.from}`
  const decide = (requestId: string, decision: 'accepted' | 'rejected', why: string) =>
    ai('/v1/decisions', { method: 'POST', body: { request_id: requestId, decision, feature: 'law_explain', note: why } })

  async function explain() {
    setNote('')
    setBusy(true)
    try {
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'law_explain', prompt_version: EXPLAIN_PROMPT_VERSION, prompt: explainPrompt(entry, language), max_tokens: 600 } })
      const read = readExplanation(request.draft, entry)
      if (read.kind !== 'text') await decide(request.request_id, 'rejected', 'the explanation was empty or gave an opinion and was not shown')
      setAsked({ request, read, logged: read.kind === 'text' ? undefined : 'rejected' })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function finish(a: Asked, decision: 'accepted' | 'rejected') {
    setNote('')
    try {
      await decide(a.request.request_id, decision, decision === 'accepted' ? 'the officer found the explanation helpful' : 'the officer found the explanation not helpful')
      setAsked({ ...a, logged: decision })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div className="card" aria-label={t('lx.title', { old, new: `${entry.newLaw} ${entry.to}` })}>
      <h3>{t('lx.title', { old, new: `${entry.newLaw} ${entry.to}` })}</h3>
      <label>{t('lx.language')} <select value={language} onChange={(e) => setLanguage(e.target.value)}>
        {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <p><button type="button" onClick={() => void explain()} disabled={busy}>{t(busy ? 'lx.writing' : 'lx.ask')}</button> <small>{t('lx.sends')}</small></p>
      {note && <p role="alert">{note}</p>}
      {asked && (
        <div className="card" aria-label={t('lx.aiPanel')}>
          <p><span className="chip c-ai">{t('lx.aiPanel')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
          {asked.read.kind === 'empty' && <p>{t('lx.empty')}</p>}
          {asked.read.kind === 'refused' && <p>{t('lx.opinion')}</p>}
          {asked.read.kind === 'text' && <>
            {asked.read.odd.length > 0 && <p role="note">{t('lx.odd', { list: asked.read.odd.join(', ') })}</p>}
            <p lang={language}>{asked.read.text}</p>
            {!asked.logged && <p><button type="button" onClick={() => void finish(asked, 'accepted')}>{t('lx.helpful')}</button>{' '}
              <button type="button" onClick={() => void finish(asked, 'rejected')}>{t('lx.notHelpful')}</button></p>}
          </>}
          {asked.logged && <p role="status">{t('lx.logged', { decision: t.code('facts.decision', asked.logged) })}</p>}
        </div>
      )}
    </div>
  )
}
