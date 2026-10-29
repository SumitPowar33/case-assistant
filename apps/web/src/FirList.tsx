import { useState } from 'react'
import { useLoad } from './useLoad'
import { NewFirForm } from './Forms'
import { fmt } from './formats'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; action_taken: string; sexual_offence: boolean }

const PAGE = 50

export default function FirList() {
  const [page, setPage] = useState(0)
  // one extra row tells whether a next page exists
  const { data: rows, error } = useLoad<Fir[]>(`/firs?limit=${PAGE + 1}&offset=${page * PAGE}`)
  const data = rows?.slice(0, PAGE)
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
    {(page > 0 || (rows?.length ?? 0) > PAGE) && <nav aria-label="Pages">
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
      <span> Page {page + 1} </span>
      <button disabled={(rows?.length ?? 0) <= PAGE} onClick={() => setPage(page + 1)}>Older</button>
    </nav>}
    </>
  )
}
