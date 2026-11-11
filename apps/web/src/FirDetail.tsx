import { useLoad } from './useLoad'
import { fmt } from './formats'
import Readiness from './Readiness'
import CaseDiary from './CaseDiary'
import AskCaseFile from './AskCaseFile'
import MoneyTrail from './MoneyTrail'
import Statements from './Statements'
import Search from './Search'
import FactCheck from './FactCheck'
import SectionSuggest from './SectionSuggest'
import FinalReport from './FinalReport'
import Notices from './Notices'
import Certificates from './Certificates'
import Arrests from './Arrests'
import IoAssignment from './IoAssignment'
import Chargesheets from './Chargesheets'
import ClosureReport from './ClosureReport'
import VictimUpdates from './VictimUpdates'
import { AddEvidenceForm, AddPersonForm } from './Forms'
import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { currentSession } from './api'
import { PARTS, PART_LABEL, type Part } from './firParts'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; contents_original: string | null; contents_withheld: boolean; victim_protected: boolean; case_team: boolean; action_taken: string; io_name: string | null; sections: { act: string; section: string }[] }
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

/** On a phone (the same 40rem the style sheet uses) the FIR opens on Deadlines: in the field the 24-hour and 60/90-day limits matter most. */
const onPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 40rem)').matches

export default function FirDetail({ id, only }: { id: string; only?: Part }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [part, setPart] = useState<Part>(only ?? (onPhone() ? 'deadlines' : 'case'))
  useEffect(() => { if (only) setPart(only) }, [only])
  const shown = (p: Part) => (p === part ? 'fir-part shown' : 'fir-part')
  const { data: fir, error } = useLoad<Fir>(`/firs/${id}`, version)
  // the people are read once here and handed to the arrest, chargesheet and readiness parts (each used to read them again)
  const { data: people, error: peopleError } = useLoad<Person[]>(`/firs/${id}/people`, version)
  const saved = () => setVersion((v) => v + 1)
  if (error) return <p role="alert">{error}</p>
  if (!fir) return <p>{t('common.loading')}</p>
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="#/firs">{t('fir.back')}</a>{only && <> / {t(PART_LABEL[only])}</>}</div>
          <h1>{t('fir.title', { no: fir.fir_no, year: fir.fir_year })}{fir.is_zero_fir ? ` ${t('fir.zeroSuffix')}` : ''}</h1>
          <p className="lede">{t('fir.registered', { date: fmt(fir.registered_at) })} · {t.code('action', fir.action_taken)}</p>
        </div>
        <div className="chips">{fir.sections.map((s) => <span key={s.act + s.section} className="chip c-info">{s.act} {s.section}</span>)}</div>
      </div>
      <label className="fir-parts">{t('fir.partShow')}{' '}
        <select value={part} onChange={(e) => setPart(e.target.value as Part)}>
          {PARTS.map((p) => <option key={p} value={p}>{t(PART_LABEL[p])}</option>)}
        </select>
      </label>
      <div className={only ? 'fir-body one-part' : 'fir-body'}>
      <div className={shown('case')}>
        <section>
        <IoAssignment firId={id} ioName={fir.io_name} version={version} onSaved={saved} />
        <p>{t('fir.sections', { list: fir.sections.map((s) => `${s.act} ${s.section}`).join(', ') || t('fir.sectionsNone') })}</p>
        {fir.contents_withheld
          ? <p>{t('fir.withheld')}</p>
          : <blockquote>{fir.contents_original}</blockquote>}
        </section>
        {fir.case_team && fir.contents_original && <FactCheck firId={id} text={fir.contents_original} victimProtected={fir.victim_protected} />}
        {fir.case_team && fir.contents_original && <SectionSuggest firId={id} text={fir.contents_original} victimProtected={fir.victim_protected} version={version} onSaved={saved} />}
      </div>
      <div className={shown('people')}>
        <section>
          <h2>{t('fir.people')}</h2>
          {peopleError ? <p role="alert">{peopleError}</p> : !people ? <p>{t('common.loading')}</p> : people.length ? <ul>{people.map((p) => (
            <li key={p.id}>{p.label} ({t.code('person', p.role)}){p.age_years ? `, ${p.age_years}` : ''}: {p.display_name}{p.identity_masked ? ` (${t('fir.identityProtected')})` : ''}</li>
          ))}</ul> : <p>{t('common.noneYet')}</p>}
          <AddPersonForm firId={id} onSaved={saved} />
        </section>
      </div>
      <div className={shown('arrests')}><Arrests firId={id} people={people} version={version} onSaved={saved} /></div>
      <div className={shown('chargesheets')}><Chargesheets firId={id} people={people} version={version} onSaved={saved} /></div>
      <div className={shown('closure')}><ClosureReport firId={id} version={version} onSaved={saved} /></div>
      <div className={shown('deadlines')}>
        <Section<Deadline> title={t('fir.deadlines')} path={`/firs/${id}/deadlines`} version={version}>
          {(rows) => <ul>{rows.map((d, i) => <li key={i}>{t('fir.dueBy', { kind: deadlineLabel(t, d.kind), date: d.due_on })} <small>({d.basis})</small></li>)}</ul>}
        </Section>
        <VictimUpdates firId={id} version={version} onSaved={saved} />
      </div>
      <div className={shown('evidence')}>
        <Section<Evidence> title={t('fir.evidence')} path={`/firs/${id}/evidence`} version={version} form={<AddEvidenceForm firId={id} onSaved={saved} />}>
          {(rows) => <ul className="plain">{rows.map((e) => (
            <li key={e.id} className="card"><strong>{e.label}</strong> ({t.code('evidenceKind', e.kind)})
              {e.kind === 'electronic' && <> <span className={`chip ${e.court_ready ? 'c-ok' : 'c-warn'}`}>{t(e.court_ready ? 'evidence.courtReady' : 'evidence.notCourtReady')}</span></>}
              {e.sha256 && <> · <code title={e.sha256}>{e.sha256.slice(0, 4)}…{e.sha256.slice(-4)}</code></>}
              {e.kind === 'electronic' && <Certificates firId={id} item={e} onSaved={saved} />}</li>
          ))}</ul>}
        </Section>
      </div>
      <div className={shown('search')}><Search firId={id} onSaved={saved} /></div>
      <div className={shown('notices')}><Notices firId={id} fir={fir} victimProtected={fir.victim_protected} /></div>
      <div className={shown('readiness')}><Readiness key={version} firId={id} people={people ?? []} /></div>
      <div className={shown('statements')}><Statements key={version} firId={id} victimProtected={fir.victim_protected} /></div>
      <div className={shown('money')}><MoneyTrail key={version} firId={id} /></div>
      <div className={shown('finalReport')}><FinalReport key={version} firId={id} me={currentSession()?.user.id ?? ''} /></div>
      <div className={shown('diary')}><CaseDiary firId={id} /></div>
      <div className={shown('ask')}>{part === 'ask' && <AskCaseFile firId={id} />}</div>
      </div>
    </>
  )
}
