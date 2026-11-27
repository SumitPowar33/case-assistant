import { useContext, useEffect, useState } from 'react'
import { get } from './api'
import { ScreenLangContext } from './i18n'

type Answer = { status: string; texts: Record<string, string> }

/**
 * The playbooks' texts in the screen language (item 3, packs/{module}/playbook-texts), looked up by the English text.
 * They are shown under the English text, never in its place: the English is the one that holds, and the one the AI
 * features send. If no module has them, or they cannot be read, the English alone shows.
 */
export function usePlaybookTexts() {
  const lang = useContext(ScreenLangContext)
  const [answer, setAnswer] = useState<Answer & { lang: string }>()
  useEffect(() => {
    if (lang === 'en') return
    let live = true
    get<Answer>(`/playbooks/texts?language=${lang}`).then((a) => { if (live) setAnswer({ ...a, lang }) }, () => {})
    return () => { live = false }
  }, [lang])
  const texts = answer?.lang === lang ? answer?.texts ?? {} : {}
  const of = (english: string): string | undefined => texts[english]
  return { lang, of, draft: answer?.status === 'draft' && Object.keys(texts).length > 0 }
}
export type PlaybookTexts = ReturnType<typeof usePlaybookTexts>
