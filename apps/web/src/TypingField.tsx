import { useContext, useId, useLayoutEffect, useRef, useState } from 'react'
import { LANGS, TypingContext, suggestions, wordBefore } from './typing'

type Props = { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }
type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * A text field that turns English-letters typing into the chosen Indian script.
 * Space, Enter (multi-line) or punctuation puts in the top suggestion; a click picks another;
 * Esc keeps the word in English. With the language set to English it is a plain field.
 */
export default function TypingField({ label, value, onChange, multiline }: Props) {
  const { lang } = useContext(TypingContext)
  const id = useId()
  const ref = useRef<Field>(null)
  const [word, setWord] = useState('')
  const [keepEnglish, setKeepEnglish] = useState(false)
  const [caret, setCaret] = useState<number | null>(null)
  const options = keepEnglish ? [] : suggestions(word, lang)
  const tag = lang === 'en' ? 'en' : LANGS[lang].tag

  useLayoutEffect(() => {
    if (caret !== null && ref.current) {
      ref.current.setSelectionRange(caret, caret)
      setCaret(null)
    }
  }, [caret])

  function track(el: Field) {
    const w = wordBefore(el.value, el.selectionStart ?? el.value.length)
    setWord(w)
    if (!w) setKeepEnglish(false)
  }

  function put(choice: string, after: string) {
    const el = ref.current
    const end = el?.selectionStart ?? value.length
    const start = end - word.length
    onChange(value.slice(0, start) + choice + after + value.slice(end))
    setCaret(start + choice.length + after.length)
    setWord('')
    el?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<Field>) {
    if (!options.length) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setKeepEnglish(true)
    } else if (e.key === ' ' || /^[.,?!;:]$/.test(e.key) || (e.key === 'Enter' && multiline)) {
      e.preventDefault()
      put(options[0], e.key === 'Enter' ? '\n' : e.key)
    }
  }

  const common = {
    id, value, lang: tag, onKeyDown,
    onChange: (e: React.ChangeEvent<Field>) => { onChange(e.target.value); track(e.target) },
    onSelect: (e: React.SyntheticEvent<Field>) => track(e.currentTarget),
  }
  return (
    <div className="typing-field">
      <label htmlFor={id}>{label}</label>
      {multiline
        ? <textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={6} {...common} />
        : <input ref={ref as React.Ref<HTMLInputElement>} {...common} />}
      <div aria-live="polite">
        {options.length > 0 && (
          <ul className="suggestions" aria-label={`Suggestions for ${word}`}>
            {options.map((s) => (
              <li key={s}>
                <button type="button" lang={s === word ? 'en' : tag} onMouseDown={(e) => e.preventDefault()} onClick={() => put(s, '')}>{s}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
