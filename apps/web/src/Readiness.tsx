import { useEffect, useState, type FormEvent } from 'react'
import { get, send } from './api'

type Linked = { id: string; linkId: string; label: string; kind: string; courtReady?: boolean; linkType?: string }
type Holder = { personId: string; name: string; basis: string; links: Linked[] }
type Ingredient = { id: string; text: string; suggestedProof: string[]; evidence: Linked[] }
type Charge = { id: string; law: string; label: string; ingredients: Ingredient[] }
type Gap = { key: string; severity: string; text: string; override: { id: string; reason: string; decidedBy: string; decidedAt: string } | null }
type Withdrawn = { what: string; detail: string; reason: string; withdrawn_by: string; withdrawn_at: string }
type Report = {
  playbook: { id: string; version: string; status: string; reviewNote: string } | null
  charges: Charge[]; gaps: Gap[]; openGaps: number; sectionsNotInPlaybook?: string[]
  checksToConfirm?: { id: string; severity: string; text: string }[]
  secondLinkRule?: { text: string; requiresAny: string[] } | null; accountHolders?: Holder[]; withdrawn?: Withdrawn[]
}
type Playbook = { id: string; version: string; status: string; appliesTo: string }
type Evidence = { id: string; label: string; kind: string }
type Person = { id: string; role: string; label: string | null; display_name: string | null }

const words = (id: string) => id.replace(/_/g, ' ')
const shown = (e: Linked) => `${e.label}${e.kind === 'electronic' ? (e.courtReady ? ' (63(4) complete)' : ' (63(4) certificate missing)') : ''}`

/**
 * Charge ingredients -> linked evidence -> gaps. Lists facts about the file only; it never scores the case or anyone in it.
 * Writes (choose playbook, link, accept a gap) are allowed for the case team only; the server says so otherwise.
 */
export default function Readiness({ firId }: { firId: string }) {
  const [report, setReport] = useState<Report>()
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([get<Report>(`/firs/${firId}/readiness`), get<Playbook[]>('/playbooks'), get<Evidence[]>(`/firs/${firId}/evidence`),
      get<Person[]>(`/firs/${firId}/people`)])
      .then(([r, p, e, pp]) => { if (live) { setReport(r); setPlaybooks(p); setEvidence(e); setPeople(pp) } }, (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [firId, version])

  async function act(e: FormEvent<HTMLFormElement>, run: (form: FormData) => Promise<unknown>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    // cleared after success, so a basis or reason typed for one item is never sent again for the next
    try { await run(new FormData(form)); form.reset(); setVersion((v) => v + 1) } catch (err) { setError((err as Error).message) }
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
                    ? i.evidence.map((e, n) => <span key={e.linkId}>{n > 0 && ', '}{shown(e)}{' '}
                      <Withdraw firId={firId} kind="links" id={e.linkId} what={`link of ${e.label}`} act={act} /></span>)
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
          {report.secondLinkRule && <SecondLinks firId={firId} rule={report.secondLinkRule} holders={report.accountHolders ?? []}
            accused={people.filter((p) => p.role === 'accused')} evidence={evidence} act={act} />}
          {!!report.sectionsNotInPlaybook?.length && <p>Not checked by this playbook: {report.sectionsNotInPlaybook.join(', ')}.</p>}
          <h3>Gaps</h3>
          {report.gaps.length === 0 ? <p>No gaps found.</p> : <ul>{report.gaps.map((g) => (
            <li key={g.key}>{g.text}{' '}
              {g.override ? <><small>Accepted by {g.override.decidedBy}: “{g.override.reason}”</small>{' '}
                <Withdraw firId={firId} kind="overrides" id={g.override.id} what="acceptance" act={act} /></> : (
                <form className="inline" onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/readiness/overrides`, 'POST', { gapKey: g.key, reason: f.get('reason') }))}>
                  <label>Reason to accept this gap{' '}<input name="reason" minLength={10} required /></label>{' '}
                  <button type="submit">Accept with reason</button>
                </form>
              )}
            </li>
          ))}</ul>}
          {!!report.withdrawn?.length && <>
            <h3>Withdrawn</h3>
            <ul>{report.withdrawn.map((w, n) => <li key={n}>{w.what}: {w.detail}. Withdrawn by {w.withdrawn_by}: “{w.reason}”</li>)}</ul>
          </>}
          {!!report.checksToConfirm?.length && <>
            <h3>Checks for a person to confirm</h3>
            <ul>{report.checksToConfirm.map((r) => <li key={r.id}>{r.text}</li>)}</ul>
          </>}
        </>
      )}
    </section>
  )
}

type Act = (e: FormEvent<HTMLFormElement>, run: (form: FormData) => Promise<unknown>) => void

/** Account-holder accused and the independent links recorded for each (the playbook's second-link rule). */
function SecondLinks({ firId, rule, holders, accused, evidence, act }: {
  firId: string; rule: { text: string; requiresAny: string[] }; holders: Holder[]; accused: Person[]; evidence: Evidence[]; act: Act
}) {
  const unmarked = accused.filter((p) => !holders.some((h) => h.personId === p.id))
  return (
    <div>
      <h3>Account holders</h3>
      <p>{rule.text}</p>
      {holders.length === 0 ? <p>No accused is marked as an account holder.</p> : <ul>{holders.map((h) => (
        <li key={h.personId}>{h.name} <small>({h.basis})</small>:{' '}
          {h.links.length ? h.links.map((l, n) => <span key={l.linkId}>{n > 0 && ', '}{words(l.linkType ?? '')}: {shown(l)}{' '}
            <Withdraw firId={firId} kind="accused-links" id={l.linkId} what={`link of ${l.label} for ${h.name}`} act={act} /></span>)
            : <em>no independent link yet</em>}
          {evidence.length > 0 && (
            <form className="inline" onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/readiness/accused-links`, 'POST',
              { personId: h.personId, linkType: f.get('type'), evidenceItemId: f.get('item') }))}>
              <label><span className="visually-hidden">Kind of link for {h.name}</span>
                <select name="type">{rule.requiresAny.map((t) => <option key={t} value={t}>{words(t)}</option>)}</select>
              </label>{' '}
              <label><span className="visually-hidden">Evidence for {h.name}</span>
                <select name="item">{evidence.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
              </label>{' '}<button type="submit">Add link</button>
            </form>
          )}
        </li>
      ))}</ul>}
      {unmarked.length > 0 && (
        <form onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/people/${f.get('person')}/account-holder`, 'PUT', { basis: f.get('basis') }))}>
          <label>Accused{' '}
            <select name="person">{unmarked.map((p) => <option key={p.id} value={p.id}>{[p.label, p.display_name].filter(Boolean).join(' ')}</option>)}</select>
          </label>{' '}
          <label>Basis (which record shows the account){' '}<input name="basis" minLength={5} required /></label>{' '}
          <button type="submit">Mark as account holder</button>
        </form>
      )}
    </div>
  )
}

/** Withdraws a wrong link or an accepted gap. Needs a reason; the record stays and is listed under "Withdrawn". */
function Withdraw({ firId, kind, id, what, act }: { firId: string; kind: string; id: string; what: string; act: Act }) {
  return (
    <details className="inline">
      <summary>Withdraw<span className="visually-hidden"> {what}</span></summary>
      <form className="inline" onSubmit={(e) => act(e, (f) => send(`/firs/${firId}/readiness/${kind}/${id}/withdraw`, 'POST', { reason: f.get('reason') }))}>
        <label>Reason to withdraw {what}{' '}<input name="reason" minLength={10} required /></label>{' '}
        <button type="submit">Withdraw {what}</button>
      </form>
    </details>
  )
}
