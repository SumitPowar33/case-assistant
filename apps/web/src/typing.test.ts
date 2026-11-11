import { expect, test } from 'vitest'
import { convertAll, suggestions, wordBefore } from './typing'

// Fictional words only.
test('the word before the caret is the English letters that end there', () => {
  expect(wordBefore('hello namaste', 13)).toBe('namaste')
  expect(wordBefore('hello namaste', 5)).toBe('hello')
  expect(wordBefore('hello ', 6)).toBe('')
  expect(wordBefore('', 0)).toBe('')
})

test('English is never converted and gives no suggestions', () => {
  expect(suggestions('namaste', 'en')).toEqual([])
  expect(convertAll('namaste duniya', 'en')).toBe('namaste duniya')
})

test('an empty word gives no suggestions; a Hindi word gives some in Devanagari', () => {
  expect(suggestions('', 'hi')).toEqual([])
  const s = suggestions('namaste', 'hi')
  expect(s.length).toBeGreaterThan(0)
  expect(s.some((x) => /[ऀ-ॿ]/.test(x))).toBe(true)
})

test('a sentence is converted word by word in the chosen script', () => {
  expect(/[ऀ-ॿ]/.test(convertAll('namaste duniya', 'hi'))).toBe(true)
  expect(convertAll('', 'hi')).toBe('')
})
