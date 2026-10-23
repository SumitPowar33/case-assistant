import { useLoad } from './useLoad'
import { fmt } from './FirList'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; contents_original: string; action_taken: string; sections: { act: string; section: string }[] }
type Person = { id: string; role: string; label: string; display_name: string; age_years: number | null; identity_masked: boolean }
type Deadline = { kind: string; due_on: string; basis: string }
type Evidence = { id: string; label: string; kind: string; sha256: string | null; court_ready: boolean }

function Section<T>({ title, path, children }: { title: string; path: string; children: (rows: T[]) => React.ReactNode }) {
  const { data, error } = useLoad<T[]>(path)
  return (
    <section>
      <h2>{title}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : data.length ? children(data) : <p>None yet.</p>}
    </section>
  )
}

export default function FirDetail({ id }: { id: string }) {
  const { data: fir, error } = useLoad<Fir>(`/firs/${id}`)
  if (error) return <p role="alert">{error}</p>
  if (!fir) return <p>Loading…</p>
  return (
    <>
      <p><a href="#/">← All FIRs</a></p>
      <h1>FIR {fir.fir_no}/{fir.fir_year}{fir.is_zero_fir ? ' (Zero FIR)' : ''}</h1>
      <p>Registered {fmt(fir.registered_at)} · {fir.action_taken}</p>
      <p>Sections: {fir.sections.map((s) => `${s.act} ${s.section}`).join(', ') || 'none'}</p>
      <blockquote>{fir.contents_original}</blockquote>
      <Section<Person> title="People" path={`/firs/${id}/people`}>
        {(rows) => <ul>{rows.map((p) => (
          <li key={p.id}>{p.label} ({p.role}){p.age_years ? `, ${p.age_years}` : ''}: {p.display_name}{p.identity_masked ? ' (identity protected)' : ''}</li>
        ))}</ul>}
      </Section>
      <Section<Deadline> title="Deadlines" path={`/firs/${id}/deadlines`}>
        {(rows) => <ul>{rows.map((d, i) => <li key={i}>{d.kind}: by {d.due_on} <small>({d.basis})</small></li>)}</ul>}
      </Section>
      <Section<Evidence> title="Evidence" path={`/firs/${id}/evidence`}>
        {(rows) => <ul>{rows.map((e) => (
          <li key={e.id}>{e.label} ({e.kind}) · {e.court_ready ? 'court-ready' : 'not court-ready yet'}</li>
        ))}</ul>}
      </Section>
    </>
  )
}
