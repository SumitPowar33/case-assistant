import { useContext, useState } from 'react'
import TypingField from './TypingField'
import { LANGS, TypingContext, convertAll } from './typing'
import { ScreenLangContext, useT } from './i18n'

/** Language tool: a scratch box for typing (or pasting) text in English letters and getting the chosen script. */
export default function TypePage() {
  const { lang } = useContext(TypingContext)
  const screenLang = useContext(ScreenLangContext)
  const t = useT()
  const [text, setText] = useState('')
  return (
    <>
      <h1>{t('type.title')}</h1>
      <p>
        {lang === 'en'
          ? t('type.chooseFirst')
          : t('type.howTo', { lang: LANGS[lang][screenLang === 'en' ? 'name' : 'label'] })}
      </p>
      <TypingField label={t('type.text')} value={text} onChange={setText} multiline />
      <button type="button" disabled={lang === 'en'} onClick={() => setText(convertAll(text, lang))}>
        {t('type.convertAll')}
      </button>
      <p><small>{t('type.spellingsOnly')}</small></p>
    </>
  )
}
