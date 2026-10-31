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

// Messages the servers write in English (a refusal, a rule) are shown in the screen language when a `server.*` text
// matches the whole message; a {name} in it stands for a value the server put in (a number, a time). A message no
// catalog knows is shown as the server wrote it. tests/repo_rules/test_server_messages.py keeps these texts in step.
const SERVER = (Object.keys(en) as Key[]).filter((k) => k.startsWith('server.')).map((key) => {
  const names: string[] = []
  const source = en[key].split(/\{(\w+)\}/).map((part, i) => {
    if (i % 2) { names.push(part); return '(.+?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { key, names, pattern: new RegExp(`^${source}$`), literal: en[key].replace(/\{\w+\}/g, '').length }
}).sort((a, b) => b.literal - a.literal)   // the most specific text first ("answered {status} for {path}" before "answered {status}")

/** A message from a server in a screen language. */
export function translateServer(lang: string, message: string): string {
  if (lang === 'en') return message
  for (const { key, names, pattern } of SERVER) {
    const m = pattern.exec(message)
    if (m) return translate(lang, key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])))
  }
  return message
}
