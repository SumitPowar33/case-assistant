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
import { useT } from './i18n'

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

export default function FirDetail({ id }: { id: string }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const { data: fir, error } = useLoad<Fir>(`/firs/${id}`, version)
  const saved = () => setVersion((v) => v + 1)
  if (error) return <p role="alert">{error}</p>
  if (!fir) return <p>{t('common.loading')}</p>
  return (
    <>
      <p><a href="#/">{t('fir.back')}</a></p>
      <h1>{t('fir.title', { no: fir.fir_no, year: fir.fir_year })}{fir.is_zero_fir ? ` ${t('fir.zeroSuffix')}` : ''}</h1>
      <p>{t('fir.registered', { date: fmt(fir.registered_at) })} · {t.code('action', fir.action_taken)}</p>
      <IoAssignment firId={id} ioName={fir.io_name} version={version} onSaved={saved} />
      <p>{t('fir.sections', { list: fir.sections.map((s) => `${s.act} ${s.section}`).join(', ') || t('fir.sectionsNone') })}</p>
      {fir.contents_withheld
        ? <p>{t('fir.withheld')}</p>
        : <blockquote>{fir.contents_original}</blockquote>}
      <Section<Person> title={t('fir.people')} path={`/firs/${id}/people`} version={version} form={<AddPersonForm firId={id} onSaved={saved} />}>
        {(rows) => <ul>{rows.map((p) => (
          <li key={p.id}>{p.label} ({t.code('person', p.role)}){p.age_years ? `, ${p.age_years}` : ''}: {p.display_name}{p.identity_masked ? ` (${t('fir.identityProtected')})` : ''}</li>
        ))}</ul>}
      </Section>
      <Arrests firId={id} version={version} onSaved={saved} />
      <Chargesheets firId={id} version={version} onSaved={saved} />
      <ClosureReport firId={id} version={version} onSaved={saved} />
      <Section<Deadline> title={t('fir.deadlines')} path={`/firs/${id}/deadlines`} version={version}>
        {(rows) => <ul>{rows.map((d, i) => <li key={i}>{t('fir.dueBy', { kind: deadlineLabel(t, d.kind), date: d.due_on })} <small>({d.basis})</small></li>)}</ul>}
      </Section>
      <VictimUpdates firId={id} version={version} onSaved={saved} />
      <Section<Evidence> title={t('fir.evidence')} path={`/firs/${id}/evidence`} version={version} form={<AddEvidenceForm firId={id} onSaved={saved} />}>
        {(rows) => <ul>{rows.map((e) => (
          <li key={e.id}>{e.label} ({t.code('evidenceKind', e.kind)}){e.kind === 'electronic' && ` · ${t(e.court_ready ? 'evidence.courtReady' : 'evidence.notCourtReady')}`}
            {e.kind === 'electronic' && <Certificates firId={id} item={e} onSaved={saved} />}</li>
        ))}</ul>}
      </Section>
      <Notices firId={id} fir={fir} />
      <Readiness key={version} firId={id} />
    </>
  )
}
