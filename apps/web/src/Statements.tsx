import { useContext, useState } from 'react'
import TypingField from './TypingField'
import { send } from './api'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'
import { TypingContext } from './typing'

type Witness = { person_id: string; role: string; label: string | null; name: string | null; statements: number }
type Statement = { id: string; label: string | null; name: string | null; recorded_at: string; recorded_by_name: string; language: string; medium: string; original_text: string }
type Data = { witnesses: Witness[]; statements: Statement[] }

const who = (p: { label: string | null; name: string | null }) => [p.label, p.name].filter(Boolean).join(' · ')

/**
 * Statements and witnesses under BNSS 180 (design board 6): the witness tracker (from the case's people, with a
 * Recorded / Not recorded chip) and the statements, each kept as said in the language spoken (V40). The language of a
 * new statement is the typing language chosen at the top. Translations come with the AI gateway later.
 */
export default function Statements({ firId }: { firId: string }) {
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
