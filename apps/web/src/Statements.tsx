import { useContext, useState } from 'react'
import TypingField from './TypingField'
import { ai, send } from './api'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'
import { TypingContext } from './typing'
import { MAX_TRANSLATION, TRANSLATE_PROMPT_VERSION, readTranslation, translatePrompt, type Draft } from './statementTranslate'

type Witness = { person_id: string; role: string; label: string | null; name: string | null; statements: number }
type Statement = { id: string; label: string | null; name: string | null; masked: boolean; recorded_at: string; recorded_by_name: string; language: string; medium: string; original_text: string
  translated_text: string | null; translation_corrected: boolean | null; translation_checked_at: string | null; translation_checked_by_name: string | null }
type Request = { request_id: string; draft: string; provider: string; model: string }
type Asked = { request: Request; read: Draft; text: string }
type Data = { witnesses: Witness[]; statements: Statement[] }

const who = (p: { label: string | null; name: string | null }) => [p.label, p.name].filter(Boolean).join(' · ')

/**
 * The English translation beside one statement (AI feature A3). A checked translation is shown under the original, which
 * stays as said. Without one, the officer may ask the AI gateway (feature statement_translate) for a draft, read it
 * against the original (numbers of the original the draft lacks are listed), correct it, and save it as checked
 * (POST .../translation), or reject it; either way the decision is logged in the gateway. Not offered for a statement in
 * English, of a case that protects the victim's identity or of a masked person: its words would go to the AI provider.
 */
function Translation({ firId, s, victimProtected, onSaved }: { firId: string; s: Statement; victimProtected: boolean; onSaved: () => void }) {
  const t = useT()
  const [asked, setAsked] = useState<Asked | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [logged, setLogged] = useState('')
  if (s.language === 'en') return null
  if (s.translated_text !== null) return (
    <div className="card" aria-label={t('translate.checked')}>
      <p><span className="chip c-ok">{t('translate.checked')}</span> <small>{t('translate.checkedBy', { name: s.translation_checked_by_name ?? '', date: fmt(s.translation_checked_at ?? '') })}
        {s.translation_corrected && <> · {t('translate.corrected')}</>}</small></p>
      <p lang="en" style={{ whiteSpace: 'pre-wrap' }}>{s.translated_text}</p>
    </div>
  )
  if (victimProtected || s.masked) return <p role="note"><small>{t('translate.notOnProtected')}</small></p>

  async function ask() {
    setNote('')
    setBusy(true)
    try {
      const request = await ai<Request>('/v1/generate', { method: 'POST', body: {
        feature: 'statement_translate', prompt_version: TRANSLATE_PROMPT_VERSION, prompt: translatePrompt(s.original_text, s.language), case_ref: firId, max_tokens: 4000 } })
      const read = readTranslation(request.draft, s.original_text)
      setAsked({ request, read, text: read.kind === 'draft' ? read.text : '' })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function decide(a: Asked, decision: string) {
    await ai('/v1/decisions', { method: 'POST', body: { request_id: a.request.request_id, decision, feature: 'statement_translate', case_ref: firId,
      note: decision === 'rejected' ? 'translation rejected' : `translation saved (${decision === 'edited' ? 'corrected' : 'as drafted'})` } })
    setLogged(decision)
  }

  async function save(a: Asked & { read: { kind: 'draft' } }) {
    setNote('')
    try {
      await send(`/firs/${firId}/statements/${s.id}/translation`, 'POST', { text: a.text.trim(), aiText: a.read.text, aiRequestId: a.request.request_id })
      try { await decide(a, a.text.trim() === a.read.text ? 'accepted' : 'edited') } finally { onSaved() }
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  async function reject(a: Asked) {
    setNote('')
    try {
      await decide(a, 'rejected')
      setAsked(null)
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  return (
    <div>
      {!asked && <p><button type="button" onClick={() => void ask()} disabled={busy}>{t(busy ? 'translate.asking' : 'translate.ask')}</button>{' '}
        <small>{t('translate.sends')}</small></p>}
      {logged === 'rejected' && <p><small>{t('translate.rejectedLogged')}</small></p>}
      {note && <p role="alert">{note}</p>}
      {asked && (
        <div className="card record-form" aria-label={t('translate.aiPanel')}>
          <p><span className="chip c-ai">{t('translate.aiPanel')}</span> <small>{asked.request.provider} · {asked.request.model}</small></p>
          {asked.read.kind === 'empty' ? <>
            <p>{t('translate.empty')}</p>
            <p><button type="button" onClick={() => void reject(asked)}>{t('translate.reject')}</button></p>
          </> : (() => {
            const a = asked as Asked & { read: { kind: 'draft' } }
            return <>
              {a.read.missing.length > 0 && <p role="note"><span className="chip c-warn">{t('translate.missingNumbers', { list: a.read.missing.join(', ') })}</span></p>}
              <label>{t('translate.text')}
                <textarea lang="en" rows={8} value={a.text} maxLength={MAX_TRANSLATION} onChange={(e) => setAsked({ ...a, text: e.target.value })} /></label>
              <p><button type="button" onClick={() => void save(a)} disabled={!a.text.trim()}>{t('translate.save')}</button>{' '}
                <button type="button" onClick={() => void reject(a)}>{t('translate.reject')}</button>{' '}
                <small>{t('translate.saveNote')}</small></p>
            </>
          })()}
        </div>
      )}
    </div>
  )
}

/**
 * Statements and witnesses under BNSS 180 (design board 6): the witness tracker (from the case's people, with a
 * Recorded / Not recorded chip) and the statements, each kept as said in the language spoken (V40). The language of a
 * new statement is the typing language chosen at the top. An English translation, checked by an officer, sits under a
 * statement made in another language ({@link Translation}).
 */
export default function Statements({ firId, victimProtected = false }: { firId: string; victimProtected?: boolean }) {
  const t = useT()
  const { lang } = useContext(TypingContext)
  const [version, setVersion] = useState(0)
  const [person, setPerson] = useState('')
  const [medium, setMedium] = useState('written')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Data>(`/firs/${firId}/statements`, version)
  if (loadError) return <section><h2>{t('statement.part')}</h2><p role="alert">{loadError}</p></section>
  if (!data) return <section><h2>{t('statement.part')}</h2><p>{t('common.loading')}</p></section>
  const witnesses = Array.isArray(data.witnesses) ? data.witnesses : [], statements = Array.isArray(data.statements) ? data.statements : []
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await send(`/firs/${firId}/statements`, 'POST', { personId: person || witnesses[0].person_id, language: lang, medium, text })
      setText('')
      setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <div className="two-col">
      <section aria-labelledby="stmt-title">
        <h2 id="stmt-title">{t('statement.title')}</h2>
        <p className="note">{t('statement.lede')}</p>
        {witnesses.length === 0 ? <p>{t('statement.noPeople')}</p> : <form className="record-form" onSubmit={(e) => void save(e)}>
          <h3>{t('statement.new')}</h3>
          <label>{t('statement.person')} <select value={person || witnesses[0].person_id} onChange={(e) => setPerson(e.target.value)}>
            {witnesses.map((w) => <option key={w.person_id} value={w.person_id}>{who(w)}</option>)}
          </select></label>
          <label>{t('statement.medium')} <select value={medium} onChange={(e) => setMedium(e.target.value)}>
            {['written', 'audio', 'video'].map((m) => <option key={m} value={m}>{t.code('statementMedium', m)}</option>)}
          </select></label>
          <TypingField label={t('statement.text')} value={text} onChange={setText} multiline speech />
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('statement.save')}</button>
        </form>}
        {statements.length === 0 ? <p>{t('statement.none')}</p> : <ul className="plain">{statements.map((s) => (
          <li key={s.id} className="card">
            <strong>{who(s)}</strong> <span className="chip c-neu">{s.language.toUpperCase()}</span>
            <p lang={s.language} style={{ whiteSpace: 'pre-wrap' }}>{s.original_text}</p>
            <p className="note">{t('statement.meta', { time: fmt(s.recorded_at), name: s.recorded_by_name, medium: t.code('statementMedium', s.medium) })}</p>
            <Translation firId={firId} s={s} victimProtected={victimProtected} onSaved={() => setVersion((v) => v + 1)} />
          </li>
        ))}</ul>}
      </section>
      <section aria-labelledby="stmt-tracker">
        <h2 id="stmt-tracker">{t('statement.tracker')}</h2>
        <ul className="ingredients">{witnesses.map((w) => (
          <li key={w.person_id}><div>{who(w)} <span className="note">({t.code('person', w.role)})</span></div>
            <span className={`chip ${w.statements > 0 ? 'c-ok' : 'c-warn'}`}>{t(w.statements > 0 ? 'statement.recorded' : 'statement.notRecorded')}</span></li>
        ))}</ul>
      </section>
    </div>
  )
}
