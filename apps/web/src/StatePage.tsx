import { useState } from 'react'
import { currentSession, send } from './api'
import { fmt } from './formats'
import { useT } from './i18n'
import { useLoad } from './useLoad'

type Change = {
  id: string; title: string; body: string; tested_note: string | null; drafted_at: string; drafted_by_name: string; drafted_by_rank: string
  decision: 'approved' | 'returned' | null; decision_note: string | null; decided_at: string | null; decided_by_name: string | null; decided_by_rank: string | null
  can_decide: boolean
}
type Answer = { pack: { code: string; name: string; version: string; languages: string[]; status: string }; changes: Change[]; can_propose: boolean }

const CHIP: Record<string, string> = { approved: 'c-ok', returned: 'c-warn' }

/**
 * State setup and approvals (board 21): the state's pack in one line, the changes proposed to it, and the approval of
 * each by someone other than its writer. An approval is the record of a decision; the pack itself changes with a release.
 * The server decides who sees and who may act; the buttons follow its answer.
 */
export default function StatePage() {
  const t = useT()
  const own = currentSession()?.user.station_id
  const [typed, setTyped] = useState('')
  const state = typed.trim().toUpperCase()
  // an account without a police station (the platform admin) says which state it means
  return (
    <>
      <h1>{t('state.title')}</h1>
      <p className="lede">{t('state.intro')}</p>
      {!own && <label>{t('state.code')} <input value={typed} maxLength={3} onChange={(e) => setTyped(e.target.value)} /></label>}
      {(own || /^[A-Z]{2,3}$/.test(state)) && <Pack key={state} state={own ? '' : state} />}
    </>
  )
}

function Pack({ state }: { state: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const answer = useLoad<Answer>(`/pack-changes${state ? `?state=${state}` : ''}`, version)
  if (answer.error) return <p role="alert">{answer.error}</p>
  if (!answer.data) return <p>{t('common.loading')}</p>
  const { pack, changes, can_propose } = answer.data
  return (
    <>
      <section aria-labelledby="state-pack">
        <h2 id="state-pack">{t('state.pack', { name: pack.name, version: pack.version })}</h2>
        <p><span className="chip c-neu">{t.code('state.status', pack.status)}</span> {t('state.languages', { list: pack.languages.join(', ') })}</p>
      </section>
      {can_propose && <Propose state={pack.code} onSaved={() => setVersion((n) => n + 1)} />}
      <section aria-labelledby="state-changes">
        <h2 id="state-changes">{t('state.changes')}</h2>
        {changes.length === 0 ? <p>{t('state.none')}</p> : changes.map((c) => <ChangeCard key={c.id} change={c} onSaved={() => setVersion((n) => n + 1)} />)}
      </section>
    </>
  )
}

function Propose({ state, onSaved }: { state: string; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    try {
      await send('/pack-changes', 'POST', { state, title: String(f.get('title')).trim(), body: String(f.get('body')).trim(), testedNote: String(f.get('testedNote')).trim() })
      form.reset()
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <form onSubmit={submit} aria-labelledby="state-propose">
      <h2 id="state-propose">{t('state.propose')}</h2>
      <p>{t('state.proposeHelp')}</p>
      <label>{t('state.fTitle')} <input name="title" required minLength={5} maxLength={120} /></label>
      <label>{t('state.fBody')} <textarea name="body" required minLength={20} maxLength={2000} rows={4} /></label>
      <label>{t('state.fTested')} <input name="testedNote" maxLength={500} /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('state.send')}</button>
    </form>
  )
}

function ChangeCard({ change: c, onSaved }: { change: Change; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  async function decide(decision: 'approve' | 'return') {
    setError('')
    try {
      await send(`/pack-changes/${c.id}/decision`, 'POST', { decision, note: note.trim() })
      setNote('')
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <article className="card" aria-label={c.title}>
      <h3>{c.title} {c.decision && <span className={`chip ${CHIP[c.decision]}`}>{t.code('state.decision', c.decision)}</span>}{!c.decision && <span className="chip c-info">{t('state.waiting')}</span>}</h3>
      <p>{c.body}</p>
      <p className="sub">{t('state.drafted', { who: `${c.drafted_by_name} (${c.drafted_by_rank})`, at: fmt(c.drafted_at) })}{c.tested_note ? ` · ${t('state.tested', { note: c.tested_note })}` : ''}</p>
      {c.decision && <p className="sub">{t('state.decidedBy', { who: `${c.decided_by_name} (${c.decided_by_rank})`, at: fmt(c.decided_at ?? '') })}{c.decision_note ? ` · ${c.decision_note}` : ''}</p>}
      {c.can_decide && (
        <div>
          <label>{t('state.note')} <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <button type="button" onClick={() => decide('approve')}>{t('state.approve')}</button>{' '}
          <button type="button" onClick={() => decide('return')}>{t('state.return')}</button>
        </div>
      )}
    </article>
  )
}
