import { useState } from 'react'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Entry = { law: string; newLaw: string; from: string; to: string | null; what: string; partial: boolean }
type Table = { status: string; note: string; entries: Entry[] }

/** Old law to new law (GET /api/law-finder): IPC, CrPC and Evidence Act sections beside the BNS, BNSS and BSA sections that replaced them. A table to look up, never a converter. */
export default function LawFinder() {
  const t = useT()
  const { data, error } = useLoad<Table>('/law-finder')
  const [find, setFind] = useState('')
  const [law, setLaw] = useState('')
  const q = find.trim().toLowerCase()
  const entries = Array.isArray(data?.entries) ? data.entries : []
  const laws = [...new Map(entries.map((e) => [e.law, e.newLaw])).entries()]
  const shown = entries.filter((e) => (!law || e.law === law) && (!q || [e.from, e.to ?? '', e.what, `${e.law} ${e.from}`, `${e.newLaw} ${e.to ?? ''}`].some((s) => s.toLowerCase().includes(q))))
  return (
    <section aria-labelledby="laws-title">
      <h2 id="laws-title">{t('laws.title')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : (
        <>
          <p>{t('laws.intro')}</p>
          {data.status !== 'reviewed' && <p><strong>{t('laws.draft')}</strong></p>}
          <label>{t('laws.search')} <input type="search" value={find} onChange={(e) => setFind(e.target.value)} /></label>
          <div className="chips" role="group" aria-label={t('laws.title')}>
            {[['', t('laws.all')], ...laws.map(([o, n]) => [o, `${o} → ${n}`])].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={law === k} onClick={() => setLaw(k)}>{label}</button>
            ))}
          </div>
          <p>{t('laws.count', { n: shown.length })}</p>
          {!shown.length ? <p>{t('laws.none')}</p> : (
            <>
              <table className="cards">
                <thead><tr><th>{t('laws.colOld')}</th><th>{t('laws.colNew')}</th><th>{t('laws.colWhat')}</th></tr></thead>
                <tbody>{shown.map((e) => (
                  <tr key={`${e.law}-${e.from}`}>
                    <td data-label={t('laws.colOld')}>{e.law} {e.from}</td>
                    <td data-label={t('laws.colNew')}>{e.to ? `${e.newLaw} ${e.to}` : t('laws.noNew')}{e.partial && <> <span className="chip c-warn">{t('laws.partial')}</span></>}</td>
                    <td data-label={t('laws.colWhat')}>{e.what}</td>
                  </tr>
                ))}</tbody>
              </table>
              {shown.some((e) => e.partial) && <p>{t('laws.partialNote')}</p>}
            </>
          )}
          <p>{t('laws.which')}</p>
        </>
      )}
    </section>
  )
}
