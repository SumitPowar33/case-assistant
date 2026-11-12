// The help chat (gateway feature app_help). Plain logic, no screen: what the officer's question is answered from, the prompt,
// and the check of the answer. The material is the app itself: the screens this officer can open (screens.ts), what each is
// for, and the texts each one shows (its labels, buttons and messages, from the screen catalogs), never case data.
// Change HELP_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import en from './i18n/en.json'
import { translate, type Key } from './i18n'
import { retrieve } from './askFile'
import type { Screen } from './screens'

export const HELP_PROMPT_VERSION = 'app_help/guide@1'
export const NOT_IN_APP = 'NOT IN THE APP'
const KEYS = Object.keys(en) as Key[]
const MAX_TEXT = 4000   // characters of one screen's texts sent with a question

export type HelpScreen = { tag: string; href: string; name: string; about: string; texts?: string }

/** Every text a screen shows, in the screen language, then in English when that is another language (a question may be in either). */
export function screenTexts(screen: Screen, lang: string): string {
  const keys = KEYS.filter((k) => screen.keys.some((p) => k.startsWith(`${p}.`)))
  const of = (l: string) => keys.map((k) => translate(l, k)).join(' · ')
  return (lang === 'en' ? of('en') : `${of(lang)} · ${of('en')}`).slice(0, MAX_TEXT)
}

/**
 * The material for one question: every screen the officer can open, named and with what it is for, numbered S1, S2… in
 * menu order; the open screen and the (at most) three whose texts share the most words with the question also carry their texts.
 */
export function helpMaterial(question: string, screens: Screen[], lang: string, here: string): HelpScreen[] {
  const all = screens.map((s, i) => ({ s, tag: `S${i + 1}`, name: translate(lang, s.label), about: translate(lang, s.about) }))
  const passages = all.map((x) => ({ id: x.tag, kind: 'screen', title: x.tag, text: `${x.name} · ${x.about} · ${screenTexts(x.s, lang)}` }))
  const ranked = [...new Set(retrieve(question, passages, 30).map((r) => r.title.replace(/, part \d+ of \d+$/, '')))].slice(0, 3)
  return all.map((x) => ({ tag: x.tag, href: x.s.href, name: x.name, about: x.about,
    ...(ranked.includes(x.tag) || x.s.href === here ? { texts: screenTexts(x.s, lang) } : {}) }))
}

/** The text sent to the gateway. Written in English whatever the screen language; the answer follows the question's language. */
export function helpPrompt(question: string, material: HelpScreen[], here: string): string {
  const open = material.find((m) => m.href === here)
  const texts = material.filter((m) => m.texts)
  return [
    `Question from an officer using the Case Assistant app: ${question.trim()}`,
    open ? `The officer has this screen open now: [${open.tag}] ${open.name}` : '',
    'The screens this officer can open, in menu order. They and the texts below are the only material you may use:',
    material.map((m) => `[${m.tag}] ${m.name}: ${m.about}`).join('\n'),
    texts.length ? `Texts shown on some of these screens (labels, buttons, messages):\n${texts.map((m) => `[${m.tag}] ${m.texts}`).join('\n')}` : '',
    'Rules for the answer:',
    '- Answer in the language of the question, in short plain sentences; use numbered steps for a task.',
    '- Every time you name a screen, put its number in square brackets after it, like [S2].',
    '- Name buttons and fields exactly as the texts above write them. Do not invent screens, buttons or steps.',
    `- If the material does not answer the question, reply with exactly: ${NOT_IN_APP}`,
    '- Explain how to use the app only. Do not advise on a particular case, and do not say who is guilty or whether anyone is telling the truth.',
  ].filter(Boolean).join('\n\n')
}

export type HelpAnswer = { kind: 'notInApp' | 'found' | 'unsourced'; text: string; screens: HelpScreen[] }

/** The answer against the material: only screens that were sent and that the answer names by number are linked. */
export function checkHelp(draft: string, sent: HelpScreen[]): HelpAnswer {
  const text = draft.trim()
  if (text.toUpperCase().includes(NOT_IN_APP)) return { kind: 'notInApp', text, screens: [] }
  const cited = new Set([...text.matchAll(/\[S(\d+)\]/g)].map((m) => `S${m[1]}`))
  const screens = sent.filter((s) => cited.has(s.tag))
  return { kind: screens.length ? 'found' : 'unsourced', text, screens }
}
