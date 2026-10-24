import { useEffect, useState, type FormEvent } from 'react'
import { get, send } from './api'

type Linked = { id: string; label: string; kind: string; courtReady?: boolean }
type Ingredient = { id: string; text: string; suggestedProof: string[]; evidence: Linked[] }
type Charge = { id: string; law: string; label: string; ingredients: Ingredient[] }
type Gap = { key: string; severity: string; text: string; override: { reason: string; decidedBy: string; decidedAt: string } | null }
type Report = {
  playbook: { id: string; version: string; status: string; reviewNote: string } | null
  charges: Charge[]; gaps: Gap[]; openGaps: number; sectionsNotInPlaybook?: string[]
  checksToConfirm?: { id: string; severity: string; text: string }[]
}
type Playbook = { id: string; version: string; status: string; appliesTo: string }
type Evidence = { id: string; label: string; kind: string }

/**
 * Charge ingredients -> linked evidence -> gaps. Lists facts about the file only; it never scores the case or anyone in it.
 * Writes (choose playbook, link, accept a gap) are allowed for the case team only; the server says so otherwise.
 */
export default function Readiness({ firId }: { firId: string }) {
  const [report, setReport] = useState<Report>()
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([get<Report>(`/firs/${firId}/readiness`), get<Playbook[]>('/playbooks'), get<Evidence[]>(`/firs/${firId}/evidence`)])
      .then(([r, p, e]) => { if (live) { setReport(r); setPlaybooks(p); setEvidence(e) } }, (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [firId, version])

  async function act(e: FormEvent<HTMLFormElement>, run: (form: FormData) => Promise<unknown>) {
    e.preventDefault()
    setError('')
    try { await run(new FormData(e.currentTarget)); setVersion((v) => v + 1) } catch (err) { setError((err as Error).message) }
  }

  if (!report) return <section><h2>Readiness check</h2>{error ? <p role="alert">{error}</p> : <p>Loading…</p>}</section>
  return (
    <section aria-labelledby="readiness">
      <h2 id="readiness">Readiness check</h2>
      {error && <p role="alert">{error}</p>}
      {!report.playbook ? (
        <form onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/playbook`, 'PUT', { playbookId: f.get('playbook') }))}>
          <label>Playbook for this case{' '}
            <select name="playbook">{playbooks.map((p) => <option key={p.id} value={p.id}>{p.id} {p.version}: {p.appliesTo}</option>)}</select>
          </label>{' '}<button type="submit">Use this playbook</button>
        </form>
      ) : (
        <>
          <p>Playbook {report.playbook.id} {report.playbook.version}
            {report.playbook.status === 'draft' && <> · <strong>draft</strong>: {report.playbook.reviewNote}</>}</p>
          <p><strong>{report.openGaps} open {report.openGaps === 1 ? 'gap' : 'gaps'}.</strong> This lists what the case file contains. It does not judge anyone.</p>
          {report.charges.map((c) => (
            <div key={c.id}>
              <h3>{c.law}: {c.label}</h3>
              <ul>{c.ingredients.map((i) => (
                <li key={i.id}>{i.text}:{' '}
                  {i.evidence.length
                    ? i.evidence.map((e) => `${e.label}${e.kind === 'electronic' ? (e.courtReady ? ' (63(4) complete)' : ' (63(4) certificate missing)') : ''}`).join(', ')
                    : <em>nothing linked (for example: {i.suggestedProof.join(', ').replace(/_/g, ' ')})</em>}
                  {evidence.length > 0 && (
                    <form className="inline" onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/readiness/links`, 'POST',
                      { chargeId: c.id, ingredientId: i.id, evidenceItemId: f.get('item') }))}>
                      <label><span className="visually-hidden">Evidence for “{i.text}”</span>
                        <select name="item">{evidence.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
                      </label>{' '}<button type="submit">Link</button>
                    </form>
                  )}
                </li>
              ))}</ul>
            </div>
          ))}
          {!!report.sectionsNotInPlaybook?.length && <p>Not checked by this playbook: {report.sectionsNotInPlaybook.join(', ')}.</p>}
          <h3>Gaps</h3>
          {report.gaps.length === 0 ? <p>No gaps found.</p> : <ul>{report.gaps.map((g) => (
            <li key={g.key}>{g.text}{' '}
              {g.override ? <small>Accepted by {g.override.decidedBy}: “{g.override.reason}”</small> : (
                <form className="inline" onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/readiness/overrides`, 'POST', { gapKey: g.key, reason: f.get('reason') }))}>
                  <label>Reason to accept this gap{' '}<input name="reason" minLength={10} required /></label>{' '}
                  <button type="submit">Accept with reason</button>
                </form>
              )}
            </li>
          ))}</ul>}
          {!!report.checksToConfirm?.length && <>
            <h3>Checks for a person to confirm</h3>
            <ul>{report.checksToConfirm.map((r) => <li key={r.id}>{r.text}</li>)}</ul>
          </>}
        </>
      )}
    </section>
  )
}
