// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import TypingField from './TypingField'
import { TypingContext, type TypingLang, wordBefore } from './typing'

function Harness({ lang, multiline }: { lang: TypingLang; multiline?: boolean }) {
  const [v, setV] = useState('')
  return (
    <TypingContext.Provider value={{ lang, setLang: () => {} }}>
      <TypingField label="Statement" value={v} onChange={setV} multiline={multiline} />
    </TypingContext.Provider>
  )
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function type(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  fireEvent.change(el, { target: { value: el.value + text } })
  el.setSelectionRange(el.value.length, el.value.length)
}

test('wordBefore finds the English-letters word at the caret', () => {
  expect(wordBefore('मी patil', 8)).toBe('patil')
  expect(wordBefore('patil ', 6)).toBe('')
  expect(wordBefore('FIR 214', 7)).toBe('')
})

test('space puts in the top Marathi suggestion and keeps typing after it', () => {
  render(<Harness lang="mr" />)
  const box = screen.getByLabelText('Statement') as HTMLInputElement
  type(box, 'police')
  expect(screen.getByRole('list', { name: 'Suggestions for police' })).toBeTruthy()
  fireEvent.keyDown(box, { key: ' ' })
  expect(box.value).toBe('पोलीस ')
  expect(box.selectionStart).toBe('पोलीस '.length)
  type(box, 'thane')
  fireEvent.keyDown(box, { key: ',' })
  expect(box.value).toBe('पोलीस ठाणे,')
  expect(box.getAttribute('lang')).toBe('mr')
})

test('a click picks another suggestion; the English spelling is always offered', () => {
  render(<Harness lang="hi" multiline />)
  const box = screen.getByLabelText('Statement') as HTMLTextAreaElement
  type(box, 'sharma')
  const buttons = screen.getAllByRole('button')
  expect(buttons[buttons.length - 1].textContent).toBe('sharma')
  fireEvent.click(buttons[buttons.length - 1])
  expect(box.value).toBe('sharma')
  type(box, ' mera')
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(box.value).toBe('sharma मेरा\n')
})

test('Esc keeps the word in English; language English means a plain field', () => {
  render(<Harness lang="mr" />)
  const box = screen.getByLabelText('Statement') as HTMLInputElement
  type(box, 'UPI')
  fireEvent.keyDown(box, { key: 'Escape' })
  expect(screen.queryByRole('list')).toBeNull()
  fireEvent.keyDown(box, { key: ' ' })
  expect(box.value).toBe('UPI')
  cleanup()
  render(<Harness lang="en" />)
  const plain = screen.getByLabelText('Statement') as HTMLInputElement
  type(plain, 'police')
  expect(screen.queryByRole('list')).toBeNull()
})

// Speech input: a fake browser recogniser.
type Fake = { lang: string; started: boolean; onresult: (e: unknown) => void; onend: () => void; onerror: (e: { error: string }) => void }
function fakeRecogniser() {
  const made: Fake[] = []
  class R {
    lang = ''; continuous = false; interimResults = true; started = false
    onresult: Fake['onresult'] = () => {}; onend: Fake['onend'] = () => {}; onerror: Fake['onerror'] = () => {}
    constructor() { made.push(this as unknown as Fake) }
    start() { this.started = true }
    stop() { this.started = false; this.onend() }
  }
  vi.stubGlobal('webkitSpeechRecognition', R)
  return made
}
const say = (r: Fake, phrases: [string, boolean][]) => act(() => r.onresult({ resultIndex: 0, results: phrases.map(([t, f]) => ({ isFinal: f, 0: { transcript: t } })) }))

function SpeechHarness({ speech }: { speech: boolean }) {
  const [v, setV] = useState('')
  return <TypingContext.Provider value={{ lang: 'mr', setLang: () => {} }}><TypingField label="Statement" value={v} onChange={setV} multiline speech={speech} /></TypingContext.Provider>
}

test('speech button is absent when not asked for or when the browser has no speech recognition', () => {
  fakeRecogniser()
  render(<SpeechHarness speech={false} />)
  expect(screen.queryByRole('button', { name: 'Speak' })).toBeNull()
  cleanup(); vi.unstubAllGlobals()
  render(<SpeechHarness speech />)
  expect(screen.queryByRole('button', { name: 'Speak' })).toBeNull()
})

test('speech adds finished phrases in the chosen language after what is typed, and stops on request', () => {
  const made = fakeRecogniser()
  render(<SpeechHarness speech />)
  const box = screen.getByLabelText('Statement') as HTMLTextAreaElement
  type(box, 'आधी')
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }))
  expect(made[0].lang).toBe('mr-IN')
  expect(made[0].started).toBe(true)
  expect(screen.getByRole('button', { name: 'Stop speaking' }).getAttribute('aria-pressed')).toBe('true')
  say(made[0], [['अर्धवट', false]])
  expect(box.value).toBe('आधी')
  say(made[0], [['पहिला शब्द ', true]])
  say(made[0], [['दुसरा', true]])
  expect(box.value).toBe('आधी पहिला शब्द दुसरा')
  fireEvent.click(screen.getByRole('button', { name: 'Stop speaking' }))
  expect(made[0].started).toBe(false)
  expect(screen.getByRole('button', { name: 'Speak' })).toBeTruthy()
})

test('a speech error is shown and typing still works; leaving the page stops listening', () => {
  const made = fakeRecogniser()
  const { unmount } = render(<SpeechHarness speech />)
  fireEvent.click(screen.getByRole('button', { name: 'Speak' }))
  act(() => made[0].onerror({ error: 'not-allowed' }))
  expect(screen.getByRole('alert').textContent).toContain('not-allowed')
  unmount()
  expect(made[0].started).toBe(false)
})
