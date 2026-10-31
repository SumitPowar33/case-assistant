import { createContext, useContext } from 'react'
import en from './i18n/en.json'

// Screen text in English and the 10 Indian languages of the national module. English is the base: every catalog has
// the same keys (checked by a test), and a key missing in a language shows the English text. Only English is
// reviewed; the others are drafts until a native speaker checks them (REVIEWED lists those that were).
export type Key = keyof typeof en
type Catalog = Partial<Record<Key, string>>
const CATALOGS: Record<string, Catalog> = Object.fromEntries(
  Object.entries(import.meta.glob<Catalog>('./i18n/*.json', { eager: true, import: 'default' }))
    .map(([path, c]) => [/([a-z]+)\.json$/.exec(path)![1], c]))
export const SCREEN_LANGS = Object.keys(CATALOGS).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : 0))
export const REVIEWED = new Set(['en'])

export function translate(lang: string, key: Key): string {
  return CATALOGS[lang]?.[key] || en[key]
}

export const ScreenLangContext = createContext('en')
/** The text of a key in the signed-in user's screen language. */
export function useT() {
  const lang = useContext(ScreenLangContext)
  return (key: Key) => translate(lang, key)
}
