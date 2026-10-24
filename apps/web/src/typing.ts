import { createContext } from 'react'
import XLIT, { type Lang } from '../../../packages/xlit/xlit.js'

/** 'en' means no conversion: the officer types English as-is. */
export type TypingLang = Lang | 'en'
export const LANGS = XLIT.LANGS
export const TypingContext = createContext<{ lang: TypingLang; setLang: (l: TypingLang) => void }>({ lang: 'en', setLang: () => {} })

/** The English-letters word that ends at the caret ('' if none). */
export function wordBefore(text: string, caret: number): string {
  return /[A-Za-z][A-Za-z~]*$/.exec(text.slice(0, caret))?.[0] ?? ''
}

export function suggestions(word: string, lang: TypingLang): string[] {
  return lang === 'en' || !word ? [] : XLIT.suggest(word, lang)
}

export function convertAll(text: string, lang: TypingLang): string {
  return lang === 'en' ? text : XLIT.sentence(text, lang)
}
