import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import TypingField from './TypingField'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'

type Arrest = {
  id: string; person_label: string; arrested_at: string; place: string; grounds: string[]; informed_name: string | null
  informed_contact: string | null; arresting_officer_name: string; max_punishment: string; first_remand_on: string | null
  chargesheet_last_day: string | null; remand_recorded_by_name: string | null
  released_on: string | null; release_basis: string | null; chargesheet_filed_on: string | null
}
type Person = { id: string; role: string; label: string; display_name: string }

/** BNSS 187(3): 90 days for the first three, 60 days for the last. */
const PUNISHMENTS: Record<string, string> = {
  death: 'death', life: 'imprisonment for life', '10_years_or_more': 'imprisonment of 10 years or more',
  less_than_10_years: 'imprisonment of less than 10 years',
}
const RELEASE: Record<string, string> = { bail: 'on bail', default_bail: 'on default bail (BNSS 187(3))', other: 'otherwise (for example discharged)' }
const days = (p: string) => (p === 'less_than_10_years' ? 60 : 90)
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** The first remand is recorded once (usually the day after the arrest memo) and then cannot be changed. */
function RemandForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  return (
    <Form title="Record the first remand" onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/first-remand`, 'POST', { firstRemandOn: text(f, 'remand') })}>
      <label>Date of first remand by the magistrate <input name="remand" type="date" required /></label>
      <p><small>This decides the last day to file the chargesheet and cannot be changed after saving. Check it against the remand order.</small></p>
    </Form>
  )
}

/** Release from custody, recorded once. After it the 60/90-day custody limit no longer runs for this accused. */
function ReleaseForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  return (
    <Form title="Record release from custody" onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/release`, 'POST', { releasedOn: text(f, 'released'), basis: f.get('basis') })}>
      <label>Released on <input name="released" type="date" required /></label>
      <label>Released <select name="basis">{Object.entries(RELEASE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <p><small>Check it against the court's order. It cannot be changed after saving.</small></p>
    </Form>
  )
}

/** The custody limit stops when the accused is released or a chargesheet naming them is filed. */
function limitStatus(a: Arrest) {
  if (a.chargesheet_filed_on) return `Chargesheet naming ${a.person_label} filed on ${a.chargesheet_filed_on}${a.chargesheet_last_day && a.chargesheet_filed_on > a.chargesheet_last_day ? ', after the last day' : ''}.`
  if (a.released_on) return `Released ${RELEASE[a.release_basis ?? ''] ?? ''} on ${a.released_on}: the custody limit no longer runs.`
  return null
}

/** Arrest memo (BNSS 35). The signed-in officer is recorded as the arresting officer; only an accused can be arrested. */
function ArrestForm({ firId, accused, onSaved }: { firId: string; accused: Person[]; onSaved: () => void }) {
  const [grounds, setGrounds] = useState('')
  if (!accused.length) return <p>Add the person as an accused first; only an accused can be arrested.</p>
  return (
    <Form title="Record an arrest (BNSS 35 memo)" onSaved={() => { setGrounds(''); onSaved() }}
      submit={(f) => {
        if (!lines(grounds).length) throw new Error('Write the grounds of arrest told to the person (BNSS 47).')
        return send(`/firs/${firId}/arrests`, 'POST', {
          personId: f.get('person'), arrestedAt: istIso(String(f.get('arrested'))), place: text(f, 'place'), grounds: lines(grounds),
          informedName: text(f, 'informed'), informedContact: text(f, 'contact'), maxPunishment: f.get('punishment'),
          firstRemandOn: text(f, 'remand'),
        })
      }}>
      <label>Accused <select name="person">{accused.map((p) => <option key={p.id} value={p.id}>{p.label}: {p.display_name}</option>)}</select></label>
      <label>Arrested (date and time, IST) <input name="arrested" type="datetime-local" required /></label>
      <label>Place of arrest <input name="place" required /></label>
      <TypingField label="Grounds of arrest told to the person (one per line)" value={grounds} onChange={setGrounds} multiline />
      <label>Relative or friend informed (BNSS 48) <input name="informed" required /></label>
      <label>Their phone or address <input name="contact" /></label>
      <label>Highest punishment for the offences <select name="punishment" defaultValue="less_than_10_years">
        {Object.entries(PUNISHMENTS).map(([k, v]) => <option key={k} value={k}>{v} ({days(k)} days to chargesheet)</option>)}
      </select></label>
      <label>Date of first remand (if already known) <input name="remand" type="date" /></label>
      <p><small>You are recorded as the arresting officer. The memo cannot be changed after saving.</small></p>
    </Form>
  )
}

export default function Arrests({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Arrest[]>(`/firs/${firId}/arrests`, version)
  const { data: people } = useLoad<Person[]>(`/firs/${firId}/people`, version)
  return (
    <section>
      <h2>Arrests</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : !data.length ? <p>None yet.</p> : (
        <ul>{data.map((a) => (
          <li key={a.id}>
            {a.person_label}: arrested {fmt(a.arrested_at)} at {a.place} by {a.arresting_officer_name}
            <br />Grounds: {a.grounds.join('; ')}
            {a.informed_name && <><br />Informed: {a.informed_name}{a.informed_contact ? ` (${a.informed_contact})` : ''}</>}
            <br />Highest punishment: {PUNISHMENTS[a.max_punishment] ?? a.max_punishment}
            <br />{a.first_remand_on
              ? <>First remand {a.first_remand_on}{a.remand_recorded_by_name ? ` (recorded by ${a.remand_recorded_by_name})` : ''}: chargesheet within {days(a.max_punishment)} days, last day <strong>{a.chargesheet_last_day}</strong> <small>(BNSS 187(3))</small></>
              : <>First remand not recorded yet: the chargesheet deadline starts from it.</>}
            {limitStatus(a) && <><br />{limitStatus(a)}</>}
            {!a.first_remand_on && <RemandForm firId={firId} arrest={a} onSaved={onSaved} />}
            {!a.released_on && <ReleaseForm firId={firId} arrest={a} onSaved={onSaved} />}
          </li>
        ))}</ul>
      )}
      {people && <ArrestForm firId={firId} accused={people.filter((p) => p.role === 'accused')} onSaved={onSaved} />}
    </section>
  )
}
