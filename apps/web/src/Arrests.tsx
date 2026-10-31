import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import TypingField from './TypingField'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type T = ReturnType<typeof useT>

type Arrest = {
  id: string; person_label: string; arrested_at: string; place: string; grounds: string[]; informed_name: string | null
  informed_contact: string | null; arresting_officer_name: string | null; max_punishment: string; first_remand_on: string | null
  chargesheet_last_day: string | null; earlier_custody_days: number; remand_recorded_by_name: string | null
  released_on: string | null; release_basis: string | null; chargesheet_filed_on: string | null; corrected: boolean; memo_corrected: boolean
  time_corrected: boolean; produce_by?: string; remand_after_24_hours?: boolean
}
type Correction = {
  id: string; arrest_id: string; first_remand_on: string | null; max_punishment: string; released_on: string | null
  release_basis: string | null; reason: string; recorded_at: string; recorded_by_name: string
}
type MemoFix = {
  id: string; arrest_id: string; place: string; grounds: string[]; informed_name: string | null; informed_contact: string | null
  reason: string; recorded_at: string; recorded_by_name: string
}
type TimeFix = { id: string; arrest_id: string; arrested_at: string; reason: string; recorded_at: string; recorded_by_name: string }
type Person = { id: string; role: string; label: string; display_name: string }
type Hint = { suggested: string | null; sections: { section: string; class: string }[]; unknown: string[] }

/** BNSS 187(3): 90 days for the first three, 60 days for the last. Labels: arrest.pun.<code> in the screen catalogs. */
const PUNISHMENTS = ['death', 'life', '10_years_or_more', 'less_than_10_years']
const RELEASE = ['bail', 'default_bail', 'other']
const days = (p: string) => (p === 'less_than_10_years' ? 60 : 90)
/** A punishment class as an option or a line: its label and the days it gives. */
const punLabel = (t: T, p: string) => t.code('arrest.pun', p)
const punOptions = (t: T) => PUNISHMENTS.map((k) => <option key={k} value={k}>{t('arrest.punOption', { pun: punLabel(t, k), days: days(k) })}</option>)
const releaseOptions = (t: T) => RELEASE.map((k) => <option key={k} value={k}>{t.code('arrest.release', k)}</option>)
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

/** The first remand is recorded once (usually the day after the arrest memo) and then cannot be changed. */
function RemandForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('arrest.remandTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/first-remand`, 'POST', { firstRemandOn: text(f, 'remand') })}>
      <label>{t('arrest.remandDate')} <input name="remand" type="date" required /></label>
      <p><small>{t('arrest.remandNote')}</small></p>
    </Form>
  )
}

/** Release from custody, recorded once. After it the 60/90-day custody limit no longer runs for this accused. */
function ReleaseForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('arrest.releaseTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/release`, 'POST', { releasedOn: text(f, 'released'), basis: f.get('basis') })}>
      <label>{t('arrest.releasedOn')} <input name="released" type="date" required /></label>
      <label>{t('arrest.how')} <select name="basis">{releaseOptions(t)}</select></label>
      <p><small>{t('arrest.releaseNote')}</small></p>
    </Form>
  )
}

/**
 * Fixes a wrong remand date, punishment class or release. The earlier entries stay on record; the newest counts.
 * Clear the release date to say the person was not released.
 */
function CorrectionForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('arrest.correctTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/corrections`, 'POST', {
        firstRemandOn: text(f, 'remand'), maxPunishment: f.get('punishment'), releasedOn: text(f, 'released'),
        releaseBasis: text(f, 'released') ? f.get('basis') : null, reason: text(f, 'reason'),
      })}>
      <label>{t('arrest.remandOn')} <input name="remand" type="date" defaultValue={arrest.first_remand_on ?? ''} /></label>
      <label>{t('arrest.punishment')} <select name="punishment" defaultValue={arrest.max_punishment}>{punOptions(t)}</select></label>
      <label>{t('arrest.releasedEmpty')} <input name="released" type="date" defaultValue={arrest.released_on ?? ''} /></label>
      <label>{t('arrest.how')} <select name="basis" defaultValue={arrest.release_basis ?? 'bail'}>{releaseOptions(t)}</select></label>
      <label>{t('common.whyCorrect')} <input name="reason" required minLength={10} /></label>
      <p><small>{t('arrest.correctNote')}</small></p>
    </Form>
  )
}

/**
 * Fixes a wrong place, grounds or informed person on the memo. The memo stays on record; the newest version counts.
 * The person arrested cannot be changed here; the time of arrest has its own correction.
 */
function MemoCorrectionForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  const t = useT()
  const [grounds, setGrounds] = useState(arrest.grounds.join('\n'))
  return (
    <Form title={t('arrest.memoTitle')} onSaved={onSaved}
      submit={(f) => {
        if (!lines(grounds).length) throw new Error(t('arrest.needGrounds'))
        return send(`/firs/${firId}/arrests/${arrest.id}/memo-corrections`, 'POST', {
          place: text(f, 'place'), grounds: lines(grounds), informedName: text(f, 'informed'), informedContact: text(f, 'contact'),
          reason: text(f, 'reason'),
        })
      }}>
      <label>{t('arrest.place')} <input name="place" required defaultValue={arrest.place} /></label>
      <TypingField label={t('arrest.grounds')} value={grounds} onChange={setGrounds} multiline />
      <label>{t('arrest.informed')} <input name="informed" required defaultValue={arrest.informed_name ?? ''} /></label>
      <label>{t('arrest.contact')} <input name="contact" defaultValue={arrest.informed_contact ?? ''} /></label>
      <label>{t('common.whyCorrect')} <input name="reason" required minLength={10} /></label>
      <p><small>{t('arrest.memoNote', { time: t('arrest.timeTitle') })}</small></p>
    </Form>
  )
}

/** Fixes a wrong time of arrest. The memo keeps the time as written; the newest counts. The server refuses a time after a remand or release already recorded. */
function TimeCorrectionForm({ firId, arrest, onSaved }: { firId: string; arrest: Arrest; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('arrest.timeTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/arrests/${arrest.id}/time-corrections`, 'POST', {
        arrestedAt: istIso(String(f.get('arrested'))), reason: text(f, 'reason'),
      })}>
      <label>{t('arrest.arrestedAt')} <input name="arrested" type="datetime-local" required /></label>
      <label>{t('common.whyCorrect')} <input name="reason" required minLength={10} /></label>
      <p><small>{t('arrest.timeNote')}</small></p>
    </Form>
  )
}

/** The custody limit stops when the accused is released or a chargesheet naming them is filed. */
function limitStatus(t: T, a: Arrest) {
  if (a.chargesheet_filed_on) {
    const late = a.chargesheet_last_day && a.chargesheet_filed_on > a.chargesheet_last_day
    return t(late ? 'arrest.csFiledLate' : 'arrest.csFiled', { label: a.person_label, date: a.chargesheet_filed_on })
  }
  if (a.released_on) return t('arrest.releasedLine', { how: a.release_basis ? t.code('arrest.release', a.release_basis) : '', date: a.released_on })
  return null
}

/** Suggests the class from the FIR's sections (draft table, to be checked by a prosecutor) and warns if the choice differs. The officer decides. */
function PunishmentHint({ hint, chosen }: { hint: Hint; chosen: string }) {
  const t = useT()
  if (!hint.suggested) return hint.unknown.length ? <p role="note"><small>{t('arrest.noHint', { sections: hint.unknown.join(', ') })}</small></p> : null
  return (
    <p role="note"><small>
      {t('arrest.hint', { sections: hint.sections.map((s) => s.section).join(', '), pun: punLabel(t, hint.suggested), days: days(hint.suggested) })}
      {chosen !== hint.suggested && <strong role="alert"> {t('arrest.hintDiffers', { pun: punLabel(t, chosen), days: days(chosen) })}</strong>}
    </small></p>
  )
}

/** Arrest memo (BNSS 35). The signed-in officer is recorded as the arresting officer; only an accused can be arrested. */
function ArrestForm({ firId, accused, hint, onSaved }: { firId: string; accused: Person[]; hint: Hint | null; onSaved: () => void }) {
  const [grounds, setGrounds] = useState('')
  const [punishment, setPunishment] = useState('less_than_10_years')
  const t = useT()
  if (!accused.length) return <p>{t('arrest.accusedFirst')}</p>
  return (
    <Form title={t('arrest.formTitle')} onSaved={() => { setGrounds(''); onSaved() }}
      submit={(f) => {
        if (!lines(grounds).length) throw new Error(t('arrest.needGrounds'))
        return send(`/firs/${firId}/arrests`, 'POST', {
          personId: f.get('person'), arrestedAt: istIso(String(f.get('arrested'))), place: text(f, 'place'), grounds: lines(grounds),
          informedName: text(f, 'informed'), informedContact: text(f, 'contact'), maxPunishment: f.get('punishment'),
          firstRemandOn: text(f, 'remand'),
        })
      }}>
      <label>{t('arrest.accused')} <select name="person">{accused.map((p) => <option key={p.id} value={p.id}>{p.label}: {p.display_name}</option>)}</select></label>
      <label>{t('arrest.arrestedAt')} <input name="arrested" type="datetime-local" required /></label>
      <label>{t('arrest.place')} <input name="place" required /></label>
      <TypingField label={t('arrest.grounds')} value={grounds} onChange={setGrounds} multiline />
      <label>{t('arrest.informed')} <input name="informed" required /></label>
      <label>{t('arrest.contact')} <input name="contact" /></label>
      <label>{t('arrest.punishment')} <select name="punishment" value={punishment} onChange={(e) => setPunishment(e.target.value)}>{punOptions(t)}</select></label>
      {hint && <PunishmentHint hint={hint} chosen={punishment} />}
      <label>{t('arrest.remandIfKnown')} <input name="remand" type="date" /></label>
      <p><small>{t('arrest.formNote')}</small></p>
    </Form>
  )
}

export default function Arrests({ firId, version, onSaved }: { firId: string; version: number; onSaved: () => void }) {
  const { data, error } = useLoad<Arrest[]>(`/firs/${firId}/arrests`, version)
  const { data: people } = useLoad<Person[]>(`/firs/${firId}/people`, version)
  const { data: memoFixes } = useLoad<MemoFix[]>(`/firs/${firId}/arrests/memo-corrections`, version)
  const { data: timeFixes } = useLoad<TimeFix[]>(`/firs/${firId}/arrests/time-corrections`, version)
  const { data: fixes } = useLoad<Correction[]>(`/firs/${firId}/arrests/corrections`, version)
  const { data: hint } = useLoad<Hint>(`/firs/${firId}/punishment-hint`, version)
  const t = useT()
  return (
    <section>
      <h2>{t('arrest.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('common.noneYet')}</p> : (
        <ul>{data.map((a) => (
          <li key={a.id}>
            {a.arresting_officer_name
              ? t('arrest.line', { label: a.person_label, date: fmt(a.arrested_at), place: a.place, officer: a.arresting_officer_name })
              : t('arrest.lineOld', { label: a.person_label, date: fmt(a.arrested_at), place: a.place })}
            <br />{t('arrest.groundsLine', { grounds: a.grounds.join('; ') })}
            {a.informed_name && <><br />{t('arrest.informedLine', { name: a.informed_name })}{a.informed_contact ? ` (${a.informed_contact})` : ''}</>}
            <br />{t('arrest.punLine', { pun: punLabel(t, a.max_punishment) })}
            <br />{a.first_remand_on
              ? <>{a.remand_recorded_by_name
                ? t('arrest.remandLineBy', { date: a.first_remand_on, name: a.remand_recorded_by_name, days: days(a.max_punishment) })
                : t('arrest.remandLine', { date: a.first_remand_on, days: days(a.max_punishment) })} <strong>{a.chargesheet_last_day}</strong> <small>(BNSS 187(3){a.earlier_custody_days > 0 ? `; ${t('arrest.earlierDays', { days: a.earlier_custody_days })}` : ''})</small></>
              : <>{t('arrest.noRemand')}{!a.released_on && a.produce_by && <> <strong>{t('arrest.produceBy', { date: fmt(a.produce_by) })}</strong></>}</>}
            {a.remand_after_24_hours && <><br /><strong role="note">{t('arrest.remandLate')}</strong></>}
            {limitStatus(t, a) && <><br />{limitStatus(t, a)}</>}
            {(fixes ?? []).filter((c) => c.arrest_id === a.id).map((c) => (
              <small key={c.id}><br />{t('arrest.fixLine', {
                date: fmt(c.recorded_at), name: c.recorded_by_name, remand: c.first_remand_on ?? t('arrest.none'), pun: punLabel(t, c.max_punishment),
                release: c.released_on ? t('arrest.fixReleased', { date: c.released_on }) : t('arrest.fixNotReleased'), reason: c.reason,
              })}</small>
            ))}
            {(memoFixes ?? []).filter((c) => c.arrest_id === a.id).map((c) => (
              <small key={c.id}><br />{t('arrest.memoFixLine', {
                date: fmt(c.recorded_at), name: c.recorded_by_name, place: c.place, grounds: c.grounds.join('; '),
                informed: c.informed_name ? t('arrest.memoFixInformed', { name: c.informed_name }) : '', reason: c.reason,
              })}</small>
            ))}
            {(timeFixes ?? []).filter((c) => c.arrest_id === a.id).map((c) => (
              <small key={c.id}><br />{t('arrest.timeFixLine', { date: fmt(c.recorded_at), name: c.recorded_by_name, time: fmt(c.arrested_at), reason: c.reason })}</small>
            ))}
            {!a.corrected && !a.first_remand_on && <RemandForm firId={firId} arrest={a} onSaved={onSaved} />}
            {!a.corrected && !a.released_on && <ReleaseForm firId={firId} arrest={a} onSaved={onSaved} />}
            <CorrectionForm firId={firId} arrest={a} onSaved={onSaved} />
            <MemoCorrectionForm firId={firId} arrest={a} onSaved={onSaved} />
            <TimeCorrectionForm firId={firId} arrest={a} onSaved={onSaved} />
          </li>
        ))}</ul>
      )}
      {people && <ArrestForm firId={firId} accused={people.filter((p) => p.role === 'accused')} hint={hint ?? null} onSaved={onSaved} />}
    </section>
  )
}
