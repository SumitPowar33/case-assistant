import { useContext, useState } from 'react'
import { currentSession, send } from './api'
import { useLoad } from './useLoad'
import { Form, NewFirForm } from './Forms'
import TypingField from './TypingField'
import { LANGS, TypingContext } from './typing'
import { fmt, istIso, text } from './formats'
import { ScreenLangContext, useT } from './i18n'

type Step = { id: string; text: string; within_minutes: number | null; basis: string | null }
type Kind = { id: string; label: string; steps: Step[] }
type Row = { id: string; received_at: string; mode: string; informant_name: string | null; withheld: boolean; kind: string; signed_at: string | null; outcome: string | null; steps_overdue: number; enquiry_overdue?: boolean }
type CheckStep = { id: string; text: string; basis: string | null; due_at: string | null; done_at: string | null; done_by_name: string | null; note: string | null; overdue: boolean }
type Complaint = {
  id: string; received_at: string; mode: string; informant_name: string | null; informant_contact: string | null; kind: string; kind_label: string
  withheld: boolean; text_original: string | null; text_language: string; recorded_by_name: string; read_back_language: string | null; signed_at: string | null
  signed_by_name: string | null; outcome: string | null; outcome_reason: string | null; fir_id: string | null; fir_no: number | null; fir_year: number | null
  sign_by: string | null; enquiry_due: string | null; steps: CheckStep[]
  enquiry_at?: string | null; enquiry_permitted_by?: string | null; enquiry_reason?: string | null; enquiry_overdue?: boolean
  versions?: { text_original: string; replaced_at: string; replaced_by_name: string }[]
}

const MODES = ['oral', 'phone', 'written', 'electronic']
const OUTCOMES = ['fir', 'ncr', 'preliminary_enquiry', 'transferred', 'no_offence', 'not_signed_in_time']
/** A language's name: in English on an English screen, otherwise in its own script (मराठी). */
const languageName = (code: string, screen: string) => code === 'en' ? 'English' : LANGS[code as keyof typeof LANGS]?.[screen === 'en' ? 'name' : 'label'] ?? code

/** Taking information at the front desk: the open complaints of the station and the form to write a new one down. */
export function FrontDeskPage() {
  const [version, setVersion] = useState(0)
  const { data, error } = useLoad<Row[]>('/complaints?open=true', version)
  const { data: kinds } = useLoad<Kind[]>('/complaint-kinds')
  const { data: me } = useLoad<{ ai_cloud_allowed?: boolean }>('/me')
  const { lang } = useContext(TypingContext)
  const t = useT()
  const [words, setWords] = useState('')
  const station = currentSession()?.user.station_id
  if (error) return <p role="alert">{error}</p>
  if (!data || !kinds) return <p>{t('common.loading')}</p>
  return (
    <section aria-labelledby="desk-h">
      <h2 id="desk-h">{t('nav.frontDesk')}</h2>
      <p>{t('desk.intro')}</p>
      <Form title={t('desk.take')} onSaved={(r) => { setWords(''); setVersion(version + 1); window.location.hash = `#/complaints/${(r as { id: string }).id}` }}
        submit={(f) => {
          if (!words.trim()) throw new Error(t('desk.needWords'))
          return send('/complaints', 'POST', {
            stationId: station, receivedAt: istIso(String(f.get('received'))), mode: f.get('mode'), informantName: text(f, 'name'),
            informantContact: text(f, 'contact'), kind: f.get('kind'), text: words.trim(), textLanguage: lang,
          })
        }}>
        <label>{t('desk.received')} <input name="received" type="datetime-local" required /></label>
        <label>{t('desk.mode')} <select name="mode" defaultValue="oral">{MODES.map((k) => <option key={k} value={k}>{t.code('mode', k)}</option>)}</select></label>
        <label>{t('desk.name')} <input name="name" required maxLength={200} /></label>
        <label>{t('desk.contact')} <input name="contact" maxLength={200} /></label>
        <label>{t('desk.kind')} <select name="kind" defaultValue="other">{kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
        <TypingField label={t('desk.words')} value={words} onChange={setWords} multiline speech={me?.ai_cloud_allowed === true} />
      </Form>
      {!data.length ? <p>{t('desk.noOpen')}</p> : <table>
        <caption>{t('desk.openCaption')}</caption>
        <thead><tr><th scope="col">{t('desk.colReceived')}</th><th scope="col">{t('desk.colInformant')}</th><th scope="col">{t('desk.kind')}</th><th scope="col">{t('desk.colState')}</th></tr></thead>
        <tbody>{data.map((c) => (
          <tr key={c.id}>
            <td><a href={`#/complaints/${c.id}`}>{fmt(c.received_at)}</a></td>
            <td>{c.withheld ? t('complaint.withheldName') : c.informant_name}</td>
            <td>{kinds.find((k) => k.id === c.kind)?.label ?? c.kind}</td>
            <td>{t(c.signed_at ? 'desk.signed' : 'desk.notSigned')}{c.steps_overdue > 0 && <strong> · {c.steps_overdue > 1 ? t('desk.overdueMany', { n: c.steps_overdue }) : t('desk.overdueOne')}</strong>}{c.enquiry_overdue && <strong> · {t('desk.enquiryOverdue')}</strong>}</td>
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
  const t = useT()
  const screen = useContext(ScreenLangContext)
  const saved = () => setVersion(version + 1)
  if (error) return <p role="alert">{error}</p>
  if (!c) return <p>{t('common.loading')}</p>
  const spoken = c.mode === 'oral' || c.mode === 'phone'
  const open = !c.outcome
  return (
    <section aria-labelledby="complaint-h">
      <p><a href="#/front-desk">{t('nav.frontDesk')}</a></p>
      <h2 id="complaint-h">{t('complaint.title', { name: c.withheld ? t('complaint.withheldName') : c.informant_name ?? '' })}</h2>
      <p>{t('complaint.meta', { kind: c.kind_label, mode: t.code('mode', c.mode), date: fmt(c.received_at), officer: c.recorded_by_name })}</p>
      {c.withheld ? <p>{t('fir.withheld')}</p> : <blockquote lang={c.text_language} className="read-back">{c.text_original}</blockquote>}
      {!!c.versions?.length && <details><summary>{t('versions.title', { n: c.versions.length })}</summary>
        <ul>{c.versions.map((v, i) => <li key={i}>{t('versions.item', { date: fmt(v.replaced_at), officer: v.replaced_by_name })} <q lang={c.text_language}>{v.text_original}</q></li>)}</ul>
      </details>}
      {c.signed_at
        ? <p>{t('complaint.recorded', { how: spoken ? t('complaint.readBack', { language: languageName(c.read_back_language ?? '', screen) }) : t('complaint.signedByInformant'), officer: c.signed_by_name ?? '', date: fmt(c.signed_at) })}</p>
        : open && <SignForm c={c} spoken={spoken} onSaved={saved} />}
      {c.signed_at && !c.withheld && <section className="print-copy" aria-label={t('copy.label')}>
        <h3>{t('copy.title')}</h3>
        <p>{t('copy.meta', { name: c.informant_name ?? '', kind: c.kind_label, date: fmt(c.received_at) })}</p>
        <blockquote lang={c.text_language}>{c.text_original}</blockquote>
        <p>{t('copy.signature', { officer: c.signed_by_name ?? '', date: fmt(c.signed_at) })}</p>
        <button type="button" className="no-print" onClick={() => window.print()}>{t('copy.print')}</button>
      </section>}
      {c.steps.length > 0 && <>
        <h3>{t('steps.title')}</h3>
        <ul>{c.steps.map((s) => (
          <li key={s.id}>{s.text}{s.basis && <small> ({s.basis})</small>}
            {s.done_at ? <> · <strong>{t('steps.done')}</strong> {t('steps.doneBy', { date: fmt(s.done_at), officer: s.done_by_name ?? '' })}{s.note && `: ${s.note}`}</>
              : <> · {s.due_at && <>{s.overdue ? <strong>{t('steps.overdue', { date: fmt(s.due_at) })}</strong> : <>{t('steps.dueBy', { date: fmt(s.due_at) })}</>}</>}
                {open && <StepForm complaintId={c.id} step={s} onSaved={saved} />}</>}
          </li>
        ))}</ul>
      </>}
      <h3>{t('outcome.title')}</h3>
      {c.enquiry_at && <p>{t('enquiry.state', { who: c.enquiry_permitted_by ?? '', date: fmt(c.enquiry_at), reason: c.enquiry_reason ?? '' })}
        {c.enquiry_due && !c.outcome && <> {c.enquiry_overdue ? <strong>{t('enquiry.overdue', { date: fmt(c.enquiry_due) })}</strong> : t('outcome.enquiryDue', { date: fmt(c.enquiry_due) })}</>}</p>}
      {c.outcome
        ? <p>{t.code('outcome', c.outcome)}{c.fir_id ? <>: <a href={`#/firs/${c.fir_id}`}>{t('fir.title', { no: c.fir_no ?? '', year: c.fir_year ?? '' })}</a></> : `: ${c.outcome_reason}`}</p>
        : c.signed_at ? <><NewFirForm complaintId={c.id} /><OutcomeForm c={c} onSaved={saved} /></>
          : <>{c.mode === 'electronic' && c.sign_by && <p>{t('outcome.signBy', { date: fmt(c.sign_by) })}</p>}
            {c.mode === 'electronic' && <OutcomeForm c={c} onSaved={saved} lapsedOnly />}
            <p>{t('outcome.firAfterSign')}</p></>}
    </section>
  )
}

function SignForm({ c, spoken, onSaved }: { c: Complaint; spoken: boolean; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t(spoken ? 'sign.spokenTitle' : 'complaint.signedByInformant')} onSaved={onSaved}
      submit={(f) => send(`/complaints/${c.id}/sign`, 'POST', { readBackLanguage: spoken ? f.get('language') : null })}>
      {spoken && <label>{t('sign.language')} <select name="language" defaultValue={c.text_language}>
        <option value="en">English</option>
        {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code}>{l.label} ({l.name})</option>)}
      </select></label>}
      <p><small>{spoken ? `${t('sign.confirmSpoken')} ` : ''}{t('sign.final')}</small></p>
    </Form>
  )
}

function StepForm({ complaintId, step, onSaved }: { complaintId: string; step: CheckStep; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('steps.markDone')} onSaved={onSaved} submit={(f) => send(`/complaints/${complaintId}/steps`, 'POST', { stepId: step.id, note: text(f, 'note') })}>
      <label>{t('steps.note')} <input name="note" maxLength={2000} /></label>
    </Form>
  )
}

function OutcomeForm({ c, onSaved, lapsedOnly }: { c: Complaint; onSaved: () => void; lapsedOnly?: boolean }) {
  const t = useT()
  const choices = OUTCOMES.filter((k) => k !== 'fir' && (lapsedOnly ? k === 'not_signed_in_time' : k !== 'not_signed_in_time') && !(k === 'preliminary_enquiry' && c.enquiry_at))
  return (
    <Form title={t('outcome.close')} onSaved={onSaved}
      submit={(f) => send(`/complaints/${c.id}/outcome`, 'POST', { outcome: f.get('outcome'), reason: text(f, 'reason'), permittedBy: text(f, 'permittedBy') })}>
      <label>{t('outcome.title')} <select name="outcome">{choices.map((k) => <option key={k} value={k}>{t.code('outcome', k)}</option>)}</select></label>
      <label>{t('outcome.reason')} <input name="reason" required minLength={10} maxLength={2000} /></label>
      {choices.includes('preliminary_enquiry') && <label>{t('enquiry.permittedBy')} <input name="permittedBy" maxLength={200} /></label>}
    </Form>
  )
}
