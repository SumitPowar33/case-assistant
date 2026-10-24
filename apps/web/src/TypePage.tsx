import { useContext, useState } from 'react'
import TypingField from './TypingField'
import { LANGS, TypingContext, convertAll } from './typing'

/** Language tool: a scratch box for typing (or pasting) text in English letters and getting the chosen script. */
export default function TypePage() {
  const { lang } = useContext(TypingContext)
  const [text, setText] = useState('')
  return (
    <>
      <h1>Type in your language</h1>
      <p>
        {lang === 'en'
          ? 'Choose a typing language at the top of the page. Every text box will then turn English letters into that script.'
          : `Typing in ${LANGS[lang].name}. Space puts in the first suggestion, a click picks another, Esc keeps the word in English.`}
      </p>
      <TypingField label="Text" value={text} onChange={setText} multiline />
      <button type="button" disabled={lang === 'en'} onClick={() => setText(convertAll(text, lang))}>
        Convert all English-letter words
      </button>
      <p><small>Suggestions are spellings only. Check names and places against the person's own documents.</small></p>
    </>
  )
}
