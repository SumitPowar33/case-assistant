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

/** The text of a key in a language, with each {name} in it replaced by vars[name]. */
export function translate(lang: string, key: Key, vars: Record<string, string | number> = {}): string {
  return (CATALOGS[lang]?.[key] || en[key]).replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** The label of a code the server sends (a person's role, a deadline kind): the key prefix.code, or the code itself when no
 *  catalog knows it, so a code added on the server still shows. */
export function translateCode(lang: string, prefix: string, code: string): string {
  const key = `${prefix}.${code}`
  return key in en ? translate(lang, key as Key) : code
}

export const ScreenLangContext = createContext('en')
/** The text of a key in the signed-in user's screen language. */
export function useT() {
  const lang = useContext(ScreenLangContext)
  const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars)
  t.code = (prefix: string, code: string) => translateCode(lang, prefix, code)
  return t
}
