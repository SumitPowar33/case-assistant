// Types for the web app (apps/web), which imports this engine directly.
export type Lang = 'mr' | 'hi' | 'gu' | 'bn' | 'pa' | 'or' | 'ta' | 'te' | 'kn' | 'ml'
declare const XLIT: {
  LANGS: Record<Lang, { name: string; label: string; off: number; tag: string; finalVirama: boolean }>
  word(w: string, lang: Lang): string
  suggest(w: string, lang: Lang): string[]
  sentence(text: string, lang: Lang): string
  toScript(deva: string, lang: Lang): string
}
export default XLIT
