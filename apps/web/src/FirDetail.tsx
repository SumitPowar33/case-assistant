import { useLoad } from './useLoad'
import { fmt } from './formats'
import Readiness from './Readiness'
import Notices from './Notices'
import Certificates from './Certificates'
import { AddEvidenceForm, AddPersonForm } from './Forms'
import { useState } from 'react'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; contents_original: string | null; contents_withheld: boolean; action_taken: string; sections: { act: string; section: string }[] }
type Person = { id: string; role: string; label: string; display_name: string; age_years: number | null; identity_masked: boolean }
type Deadline = { kind: string; due_on: string; basis: string }
type Evidence = { id: string; label: string; kind: string; sha256: string | null; court_ready: boolean }

function Section<T>({ title, path, version, children, form }: {
  title: string; path: string; version: number; children: (rows: T[]) => React.ReactNode; form?: React.ReactNode
}) {
  const { data, error } = useLoad<T[]>(path, version)
  return (
    <section>
      <h2>{title}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : data.length ? children(data) : <p>None yet.</p>}
      {form}
    </section>
  )
}

export default function FirDetail({ id }: { id: string }) {
  const { data: fir, error } = useLoad<Fir>(`/firs/${id}`)
  const [version, setVersion] = useState(0)
  const saved = () => setVersion((v) => v + 1)
  if (error) return <p role="alert">{error}</p>
  if (!fir) return <p>Loading…</p>
  return (
    <>
      <p><a href="#/">← All FIRs</a></p>
      <h1>FIR {fir.fir_no}/{fir.fir_year}{fir.is_zero_fir ? ' (Zero FIR)' : ''}</h1>
      <p>Registered {fmt(fir.registered_at)} · {fir.action_taken}</p>
      <p>Sections: {fir.sections.map((s) => `${s.act} ${s.section}`).join(', ') || 'none'}</p>
      {fir.contents_withheld
        ? <p>Complaint text withheld: this case protects the victim's identity (BNS 72). Only the case team can read it.</p>
        : <blockquote>{fir.contents_original}</blockquote>}
      <Section<Person> title="People" path={`/firs/${id}/people`} version={version} form={<AddPersonForm firId={id} onSaved={saved} />}>
        {(rows) => <ul>{rows.map((p) => (
          <li key={p.id}>{p.label} ({p.role}){p.age_years ? `, ${p.age_years}` : ''}: {p.display_name}{p.identity_masked ? ' (identity protected)' : ''}</li>
        ))}</ul>}
      </Section>
      <Section<Deadline> title="Deadlines" path={`/firs/${id}/deadlines`} version={version}>
        {(rows) => <ul>{rows.map((d, i) => <li key={i}>{d.kind}: by {d.due_on} <small>({d.basis})</small></li>)}</ul>}
      </Section>
      <Section<Evidence> title="Evidence" path={`/firs/${id}/evidence`} version={version} form={<AddEvidenceForm firId={id} onSaved={saved} />}>
        {(rows) => <ul>{rows.map((e) => (
          <li key={e.id}>{e.label} ({e.kind}){e.kind === 'electronic' && (e.court_ready ? ' · court-ready' : ' · not court-ready yet (BSA 63(4))')}
            {e.kind === 'electronic' && <Certificates firId={id} item={e} onSaved={saved} />}</li>
        ))}</ul>}
      </Section>
      <Notices firId={id} />
      <Readiness key={version} firId={id} />
    </>
  )
}
