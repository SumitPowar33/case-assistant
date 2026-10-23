import { useLoad } from './useLoad'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; action_taken: string; sexual_offence: boolean }

export const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

export default function FirList() {
  const { data, error } = useLoad<Fir[]>('/firs')
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>Loading…</p>
  if (!data.length) return <p>No FIRs yet.</p>
  return (
    <table>
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
    </table>
  )
}
