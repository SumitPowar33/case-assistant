import { useT } from './i18n'
import type { PlaybookTexts } from './usePlaybookTexts'

/** One playbook text in the screen language, on its own line under the English; nothing when there is none. */
export function PlaybookLine({ texts, en }: { texts: PlaybookTexts; en: string }) {
  const mine = texts.of(en)
  return mine ? <span className="pb-text" lang={texts.lang}>{mine}</span> : null
}

/** Says once, where playbook texts show, that nobody has reviewed the translation. */
export function PlaybookDraftNote({ texts }: { texts: PlaybookTexts }) {
  const t = useT()
  return texts.draft ? <p role="note"><small>{t('playbook.draftNote')}</small></p> : null
}
