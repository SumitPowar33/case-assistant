import { useLoad } from './useLoad'
import { NewFirForm } from './Forms'
import { fmt } from './formats'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; action_taken: string; sexual_offence: boolean }

export default function FirList() {
  const { data, error } = useLoad<Fir[]>('/firs')
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>Loading…</p>
  return (
    <>
    <NewFirForm />
    {!data.length ? <p>No FIRs yet.</p> : <table>
      <caption>FIRs</caption>
      <thead><tr><th scope="col">FIR</th><th scope="col">Registered</th><th scope="col">Type</th><th scope="col">Action</th></tr></thead>
      <tbody>
        {data.map((f) => (
          <tr key={f.id}>
            <td><a href={`#/firs/${f.id}`}>{f.fir_no}/{f.fir_year}</a></td>
            <td>{fmt(f.registered_at)}</td>
            <td>{f.is_zero_fir ? 'Zero FIR' : 'FIR'}{f.sexual_offence ? ' · sexual offence' : ''}</td>
            <td>{f.action_taken}</td>
          </tr>
        ))}
      </tbody>
    </table>}
    </>
  )
}
