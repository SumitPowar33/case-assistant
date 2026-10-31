import { useContext, useState } from 'react'
import type { Lang } from '../../../packages/xlit/xlit.js'
import { LANGS, TypingContext } from './typing'
import { ScreenLangContext, useT } from './i18n'
import { useLoad } from './useLoad'

type Entry = { id: string; term: string; law: string | null; meaning: string; terms: Record<string, string> }

/** The legal glossary from the packs (GET /api/glossary): one word per legal term in each language, so officers write the same word. */
export default function Glossary({ onUse }: { onUse: (word: string) => void }) {
  const t = useT()
  const typing = useContext(TypingContext).lang
  const screenLang = useContext(ScreenLangContext)
  const { data, error } = useLoad<{ status: string; entries: Entry[] }>('/glossary')
  const [find, setFind] = useState('')
  const [lang, setLang] = useState<Lang>(typing !== 'en' ? typing : screenLang in LANGS ? (screenLang as Lang) : 'hi')
  const q = find.trim().toLowerCase()
  const shown = data?.entries.filter((e) => !q || [e.term, e.law ?? '', ...Object.values(e.terms)].some((s) => s.toLowerCase().includes(q))) ?? []
  return (
    <section>
      <h2>{t('gloss.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : (
        <>
          {data.status !== 'reviewed' && <p><strong>{t('gloss.draft')}</strong></p>}
          <label>{t('gloss.search')} <input type="search" value={find} onChange={(e) => setFind(e.target.value)} /></label>{' '}
          <label>{t('gloss.language')} <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {(Object.keys(LANGS) as Lang[]).map((l) => <option key={l} value={l}>{LANGS[l].label}</option>)}
          </select></label>
          {!shown.length ? <p>{t('gloss.none')}</p> : (
            <table>
              <thead><tr><th>{t('gloss.colTerm')}</th><th>{t('gloss.colLaw')}</th><th>{t('gloss.colWord')}</th><th>{t('gloss.colMeaning')}</th><th>{t('gloss.add')}</th></tr></thead>
              <tbody>{shown.map((e) => (
                <tr key={e.id}>
                  <td>{e.term}</td><td>{e.law}</td><td lang={lang}>{e.terms[lang]}</td><td>{e.meaning}</td>
                  <td><button type="button" aria-label={t('gloss.addWord', { word: e.terms[lang] })} onClick={() => onUse(e.terms[lang])}>{t('gloss.add')}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}
