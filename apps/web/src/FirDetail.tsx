import { useLoad } from './useLoad'
import { fmt } from './formats'
import Readiness from './Readiness'
import Notices from './Notices'
import Certificates from './Certificates'
import Arrests from './Arrests'
import IoAssignment from './IoAssignment'
import Chargesheets from './Chargesheets'
import ClosureReport from './ClosureReport'
import VictimUpdates from './VictimUpdates'
import { AddEvidenceForm, AddPersonForm } from './Forms'
import { useState } from 'react'
import { useT, type Key } from './i18n'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; contents_original: string | null; contents_withheld: boolean; action_taken: string; io_name: string | null; sections: { act: string; section: string }[] }
type Person = { id: string; role: string; label: string; display_name: string; age_years: number | null; identity_masked: boolean }
type Deadline = { kind: string; due_on: string; basis: string }
type Evidence = { id: string; label: string; kind: string; sha256: string | null; court_ready: boolean }

/** A deadline kind from the case_deadline view; a notice reply comes as notice_reply:<addressee>. */
function deadlineLabel(t: ReturnType<typeof useT>, kind: string) {
  return kind.startsWith('notice_reply:') ? t('deadline.noticeReply', { addressee: kind.slice('notice_reply:'.length) }) : t.code('deadline', kind)
}

function Section<T>({ title, path, version, children, form }: {
  title: string; path: string; version: number; children: (rows: T[]) => React.ReactNode; form?: React.ReactNode
}) {
  const t = useT()
  const { data, error } = useLoad<T[]>(path, version)
  return (
    <section>
      <h2>{title}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : data.length ? children(data) : <p>{t('common.noneYet')}</p>}
      {form}
    </section>
  )
}

// On a phone the FIR screen shows one part at a time, chosen in one list at the top (Sumit, 1 Nov 2026: officers use the
// app in the field); on a desktop every part shows and the list is hidden (index.css). Every part still loads, so the
// readiness check and the deadlines are the same whichever part is shown.
const PARTS = ['case', 'people', 'arrests', 'chargesheets', 'closure', 'deadlines', 'evidence', 'notices', 'readiness'] as const
type Part = typeof PARTS[number]
const PART_LABEL: Record<Part, Key> = {
  case: 'fir.partCase', people: 'fir.people', arrests: 'arrest.heading', chargesheets: 'cs.heading', closure: 'closure.heading',
  deadlines: 'fir.deadlines', evidence: 'fir.evidence', notices: 'notice.heading', readiness: 'readiness.title',
}

export default function FirDetail({ id }: { id: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [part, setPart] = useState<Part>('case')
  const shown = (p: Part) => (p === part ? 'fir-part shown' : 'fir-part')
  const { data: fir, error } = useLoad<Fir>(`/firs/${id}`, version)
  const saved = () => setVersion((v) => v + 1)
  if (error) return <p role="alert">{error}</p>
  if (!fir) return <p>{t('common.loading')}</p>
  return (
    <>
      <p><a href="#/">{t('fir.back')}</a></p>
      <h1>{t('fir.title', { no: fir.fir_no, year: fir.fir_year })}{fir.is_zero_fir ? ` ${t('fir.zeroSuffix')}` : ''}</h1>
      <p>{t('fir.registered', { date: fmt(fir.registered_at) })} · {t.code('action', fir.action_taken)}</p>
      <label className="fir-parts">{t('fir.partShow')}{' '}
        <select value={part} onChange={(e) => setPart(e.target.value as Part)}>
          {PARTS.map((p) => <option key={p} value={p}>{t(PART_LABEL[p])}</option>)}
        </select>
      </label>
      <div className={shown('case')}>
        <IoAssignment firId={id} ioName={fir.io_name} version={version} onSaved={saved} />
        <p>{t('fir.sections', { list: fir.sections.map((s) => `${s.act} ${s.section}`).join(', ') || t('fir.sectionsNone') })}</p>
        {fir.contents_withheld
          ? <p>{t('fir.withheld')}</p>
          : <blockquote>{fir.contents_original}</blockquote>}
      </div>
      <div className={shown('people')}>
        <Section<Person> title={t('fir.people')} path={`/firs/${id}/people`} version={version} form={<AddPersonForm firId={id} onSaved={saved} />}>
          {(rows) => <ul>{rows.map((p) => (
            <li key={p.id}>{p.label} ({t.code('person', p.role)}){p.age_years ? `, ${p.age_years}` : ''}: {p.display_name}{p.identity_masked ? ` (${t('fir.identityProtected')})` : ''}</li>
          ))}</ul>}
        </Section>
      </div>
      <div className={shown('arrests')}><Arrests firId={id} version={version} onSaved={saved} /></div>
      <div className={shown('chargesheets')}><Chargesheets firId={id} version={version} onSaved={saved} /></div>
      <div className={shown('closure')}><ClosureReport firId={id} version={version} onSaved={saved} /></div>
      <div className={shown('deadlines')}>
        <Section<Deadline> title={t('fir.deadlines')} path={`/firs/${id}/deadlines`} version={version}>
          {(rows) => <ul>{rows.map((d, i) => <li key={i}>{t('fir.dueBy', { kind: deadlineLabel(t, d.kind), date: d.due_on })} <small>({d.basis})</small></li>)}</ul>}
        </Section>
        <VictimUpdates firId={id} version={version} onSaved={saved} />
      </div>
      <div className={shown('evidence')}>
        <Section<Evidence> title={t('fir.evidence')} path={`/firs/${id}/evidence`} version={version} form={<AddEvidenceForm firId={id} onSaved={saved} />}>
          {(rows) => <ul>{rows.map((e) => (
            <li key={e.id}>{e.label} ({t.code('evidenceKind', e.kind)}){e.kind === 'electronic' && ` · ${t(e.court_ready ? 'evidence.courtReady' : 'evidence.notCourtReady')}`}
              {e.kind === 'electronic' && <Certificates firId={id} item={e} onSaved={saved} />}</li>
          ))}</ul>}
        </Section>
      </div>
      <div className={shown('notices')}><Notices firId={id} fir={fir} /></div>
      <div className={shown('readiness')}><Readiness key={version} firId={id} /></div>
    </>
  )
}
