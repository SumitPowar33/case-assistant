import { useContext, useState } from 'react'
import { currentSession, send } from './api'
import { useLoad } from './useLoad'
import { Form, NewFirForm } from './Forms'
import TypingField from './TypingField'
import { LANGS, TypingContext } from './typing'
import { fmt, istIso, text } from './formats'

type Step = { id: string; text: string; within_minutes: number | null; basis: string | null }
type Kind = { id: string; label: string; steps: Step[] }
type Row = { id: string; received_at: string; mode: string; informant_name: string; kind: string; signed_at: string | null; outcome: string | null; steps_overdue: number }
type CheckStep = { id: string; text: string; basis: string | null; due_at: string | null; done_at: string | null; done_by_name: string | null; note: string | null; overdue: boolean }
type Complaint = {
  id: string; received_at: string; mode: string; informant_name: string; informant_contact: string | null; kind: string; kind_label: string
  text_original: string; text_language: string; recorded_by_name: string; read_back_language: string | null; signed_at: string | null
  signed_by_name: string | null; outcome: string | null; outcome_reason: string | null; fir_id: string | null; fir_no: number | null; fir_year: number | null
  sign_by: string | null; enquiry_due: string | null; steps: CheckStep[]
}

const MODES: Record<string, string> = {
  oral: 'Spoken at the station', phone: 'By phone', written: 'Written and signed by the informant', electronic: 'Electronic (e-mail, portal)',
}
const OUTCOMES: Record<string, string> = {
  fir: 'FIR registered', ncr: 'Non-cognizable: entered in the NCR register', preliminary_enquiry: 'Preliminary enquiry (BNSS 173(3))',
  transferred: 'Sent to the police station with jurisdiction', no_offence: 'No offence disclosed', not_signed_in_time: 'Electronic information not signed within three days',
}
const languageName = (code: string) => code === 'en' ? 'English' : LANGS[code as keyof typeof LANGS]?.name ?? code

/** Taking information at the front desk: the open complaints of the station and the form to write a new one down. */
export function FrontDeskPage() {
  const [version, setVersion] = useState(0)
  const { data, error } = useLoad<Row[]>('/complaints?open=true', version)
  const { data: kinds } = useLoad<Kind[]>('/complaint-kinds')
  const { data: me } = useLoad<{ ai_cloud_allowed?: boolean }>('/me')
  const { lang } = useContext(TypingContext)
  const [words, setWords] = useState('')
  const station = currentSession()?.user.station_id
  if (error) return <p role="alert">{error}</p>
  if (!data || !kinds) return <p>Loading…</p>
  return (
    <section aria-labelledby="desk-h">
      <h2 id="desk-h">Front desk</h2>
      <p>Write the information down in the informant's own words, read it over to them, and have them sign it (BNSS 173(1)). The steps of the first hour start from the time it was received.</p>
      <Form title="Take a complaint" onSaved={(r) => { setWords(''); setVersion(version + 1); window.location.hash = `#/complaints/${(r as { id: string }).id}` }}
        submit={(f) => {
          if (!words.trim()) throw new Error("Write the information in the informant's words.")
          return send('/complaints', 'POST', {
            stationId: station, receivedAt: istIso(String(f.get('received'))), mode: f.get('mode'), informantName: text(f, 'name'),
            informantContact: text(f, 'contact'), kind: f.get('kind'), text: words.trim(), textLanguage: lang,
          })
        }}>
        <label>Received (date and time, IST) <input name="received" type="datetime-local" required /></label>
        <label>How it was given <select name="mode" defaultValue="oral">{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Informant's name <input name="name" required maxLength={200} /></label>
        <label>Informant's phone or address <input name="contact" maxLength={200} /></label>
        <label>Kind <select name="kind" defaultValue="other">{kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <TypingField label="Information as given (in the informant's words)" value={words} onChange={setWords} multiline speech={me?.ai_cloud_allowed === true} />
      </Form>
      {!data.length ? <p>No open complaints.</p> : <table>
        <caption>Open complaints</caption>
        <thead><tr><th scope="col">Received</th><th scope="col">Informant</th><th scope="col">Kind</th><th scope="col">State</th></tr></thead>
        <tbody>{data.map((c) => (
          <tr key={c.id}>
            <td><a href={`#/complaints/${c.id}`}>{fmt(c.received_at)}</a></td>
            <td>{c.informant_name}</td>
            <td>{kinds.find((k) => k.id === c.kind)?.label ?? c.kind}</td>
            <td>{c.signed_at ? 'signed' : 'not signed yet'}{c.steps_overdue > 0 && <strong> · {c.steps_overdue} step{c.steps_overdue > 1 ? 's' : ''} overdue</strong>}</td>
          </tr>
        ))}</tbody>
      </table>}
    </section>
  )
}

/** One complaint: the text, the read-back and signature, the golden-hour steps, and what became of it. */
export function ComplaintPage({ id }: { id: string }) {
  const [version, setVersion] = useState(0)
  const { data: c, error } = useLoad<Complaint>(`/complaints/${id}`, version)
  const saved = () => setVersion(version + 1)
  if (error) return <p role="alert">{error}</p>
  if (!c) return <p>Loading…</p>
  const spoken = c.mode === 'oral' || c.mode === 'phone'
  const open = !c.outcome
  return (
    <section aria-labelledby="complaint-h">
      <p><a href="#/front-desk">Front desk</a></p>
      <h2 id="complaint-h">Complaint of {c.informant_name}</h2>
      <p>{c.kind_label} · {MODES[c.mode]} · received {fmt(c.received_at)} · written down by {c.recorded_by_name}</p>
      <blockquote lang={c.text_language} className="read-back">{c.text_original}</blockquote>
      {c.signed_at
        ? <p>{spoken ? `Read over to the informant in ${languageName(c.read_back_language ?? '')}, admitted correct and signed` : 'Signed by the informant'}; recorded by {c.signed_by_name} on {fmt(c.signed_at)}. The text can no longer change.</p>
        : open && <SignForm c={c} spoken={spoken} onSaved={saved} />}
      {c.signed_at && <section className="print-copy" aria-label="Copy for the informant">
        <h3>Copy for the informant (BNSS 173(2), free of cost)</h3>
        <p>{c.informant_name} · {c.kind_label} · received {fmt(c.received_at)}</p>
        <blockquote lang={c.text_language}>{c.text_original}</blockquote>
        <p>Informant's signature recorded by {c.signed_by_name} on {fmt(c.signed_at)}.</p>
        <button type="button" className="no-print" onClick={() => window.print()}>Print the copy</button>
      </section>}
      {c.steps.length > 0 && <>
        <h3>First steps</h3>
        <ul>{c.steps.map((s) => (
          <li key={s.id}>{s.text}{s.basis && <small> ({s.basis})</small>}
            {s.done_at ? <> · <strong>done</strong> {fmt(s.done_at)} by {s.done_by_name}{s.note && `: ${s.note}`}</>
              : <> · {s.due_at && <>{s.overdue ? <strong>overdue, was due {fmt(s.due_at)}</strong> : <>due by {fmt(s.due_at)}</>}</>}
                {open && <StepForm complaintId={c.id} step={s} onSaved={saved} />}</>}
          </li>
        ))}</ul>
      </>}
      <h3>Outcome</h3>
      {c.outcome
        ? <p>{OUTCOMES[c.outcome]}{c.enquiry_due && <> (to be finished by {fmt(c.enquiry_due)}, 14 days, BNSS 173(3))</>}{c.fir_id ? <>: <a href={`#/firs/${c.fir_id}`}>FIR {c.fir_no}/{c.fir_year}</a></> : `: ${c.outcome_reason}`}</p>
        : c.signed_at ? <><NewFirForm complaintId={c.id} /><OutcomeForm c={c} onSaved={saved} /></>
          : <>{c.mode === 'electronic' && c.sign_by && <p>The informant must sign by {fmt(c.sign_by)} (BNSS 173(1)(ii)).</p>}
            {c.mode === 'electronic' && <OutcomeForm c={c} onSaved={saved} lapsedOnly />}
            <p>An FIR can be registered once the informant has signed.</p></>}
    </section>
  )
}

function SignForm({ c, spoken, onSaved }: { c: Complaint; spoken: boolean; onSaved: () => void }) {
  return (
    <Form title={spoken ? 'Read over to the informant and signed' : 'Signed by the informant'} onSaved={onSaved}
      submit={(f) => send(`/complaints/${c.id}/sign`, 'POST', { readBackLanguage: spoken ? f.get('language') : null })}>
      {spoken && <label>Read over in <select name="language" defaultValue={c.text_language}>
        <option value="en">English</option>
        {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code}>{l.label} ({l.name})</option>)}
      </select></label>}
      <p><small>{spoken ? 'Confirm that the text above was read over to the informant, that they agreed it is what they said, and that they signed it. ' : ''}After this the text cannot be changed.</small></p>
    </Form>
  )
}

function StepForm({ complaintId, step, onSaved }: { complaintId: string; step: CheckStep; onSaved: () => void }) {
  return (
    <Form title="Mark as done" onSaved={onSaved} submit={(f) => send(`/complaints/${complaintId}/steps`, 'POST', { stepId: step.id, note: text(f, 'note') })}>
      <label>Note (for example the acknowledgement number) <input name="note" maxLength={2000} /></label>
    </Form>
  )
}

function OutcomeForm({ c, onSaved, lapsedOnly }: { c: Complaint; onSaved: () => void; lapsedOnly?: boolean }) {
  const choices = Object.entries(OUTCOMES).filter(([k]) => k !== 'fir' && (lapsedOnly ? k === 'not_signed_in_time' : k !== 'not_signed_in_time'))
  return (
    <Form title="Close without an FIR" onSaved={onSaved}
      submit={(f) => send(`/complaints/${c.id}/outcome`, 'POST', { outcome: f.get('outcome'), reason: text(f, 'reason') })}>
      <label>Outcome <select name="outcome">{choices.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Reason (at least 10 characters) <input name="reason" required minLength={10} maxLength={2000} /></label>
    </Form>
  )
}
