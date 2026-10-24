// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
afterEach(cleanup)

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
