import { useState } from 'react'
import { useLoad } from './useLoad'
import { NewFirForm } from './Forms'
import { fmt } from './formats'
import { useT } from './i18n'

type Fir = { id: string; fir_year: number; fir_no: number; registered_at: string; is_zero_fir: boolean; action_taken: string; sexual_offence: boolean }

const PAGE = 50

export default function FirList() {
  const t = useT()
  const [page, setPage] = useState(0)
  // one extra row tells whether a next page exists
  const { data: rows, error } = useLoad<Fir[]>(`/firs?limit=${PAGE + 1}&offset=${page * PAGE}`)
  const data = rows?.slice(0, PAGE)
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  return (
    <>
    <NewFirForm />
    {!data.length ? <p>{t('firs.empty')}</p> : <table>
      <caption>{t('nav.firs')}</caption>
      <thead><tr><th scope="col">{t('firs.colFir')}</th><th scope="col">{t('firs.colRegistered')}</th><th scope="col">{t('firs.colType')}</th><th scope="col">{t('firs.colAction')}</th></tr></thead>
      <tbody>
        {data.map((f) => (
          <tr key={f.id}>
            <td><a href={`#/firs/${f.id}`}>{f.fir_no}/{f.fir_year}</a></td>
            <td>{fmt(f.registered_at)}</td>
            <td>{t(f.is_zero_fir ? 'firs.zero' : 'firs.plain')}{f.sexual_offence ? ` · ${t('firs.sexualOffence')}` : ''}</td>
            <td>{t.code('action', f.action_taken)}</td>
          </tr>
        ))}
      </tbody>
    </table>}
    {(page > 0 || (rows?.length ?? 0) > PAGE) && <nav aria-label={t('pages.label')}>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>{t('pages.newer')}</button>
      <span> {t('pages.page', { n: page + 1 })} </span>
      <button disabled={(rows?.length ?? 0) <= PAGE} onClick={() => setPage(page + 1)}>{t('pages.older')}</button>
    </nav>}
    </>
  )
}
