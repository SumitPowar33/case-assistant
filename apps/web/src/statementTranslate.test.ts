import { expect, test } from 'vitest'
import { asciiDigits, numbers, readTranslation, translatePrompt, TRANSLATE_PROMPT_VERSION } from './statementTranslate'

// Fictional data only.
test('the prompt names the language, carries the statement whole and asks for a translation only, never a judgment', () => {
  const p = translatePrompt('बाबा व्हिडिओ कॉलवर होते.', 'mr')
  expect(p).toContain('from Marathi into English')
  expect(p).toContain('<<<\nबाबा व्हिडिओ कॉलवर होते.\n>>>')
  expect(p).toMatch(/Do not say whether the statement is true/)
  expect(p).toMatch(/keep every name, number, date/)
  expect(translatePrompt('x', 'sat')).toContain('from the language with the code "sat" into English')
  for (const [code, name] of [['hi', 'Hindi'], ['bn', 'Bengali'], ['pa', 'Punjabi'], ['gu', 'Gujarati'], ['or', 'Odia'], ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['ml', 'Malayalam']])
    expect(translatePrompt('x', code)).toContain(`from ${name} into`)
  expect(TRANSLATE_PROMPT_VERSION).toBe('statement_translate/en@1')
})

test('the digits of every Indian script are read as ASCII digits; other characters stay', () => {
  expect(asciiDigits('०१२३४५६७८९')).toBe('0123456789')   // Devanagari
  expect(asciiDigits('৪০ ੪੦ ૪૦ ୪୦ ௪௦ ౪౦ ೪೦ ൪൦')).toBe('40 40 40 40 40 40 40 40')   // Bengali to Malayalam
  expect(asciiDigits('रु. 40 आणि ٤٠')).toBe('रु. 40 आणि ٤٠')   // Arabic-Indic digits are not an Indian script's: left as they are
  expect(asciiDigits('क ख')).toBe('क ख')
})

test('numbers are runs of digits, with thousands marks read as one number', () => {
  expect(numbers('रु. ४०,००० दिले, फोन 98000 00000, 2.5 तास')).toEqual(['40000', '98000', '00000', '25'])
  expect(numbers('no numbers')).toEqual([])
})

test('the draft is read without fences or a label, and the numbers of the original it lacks are listed once', () => {
  const original = 'दिनांक २८ रोजी ४०,००० रुपये गेले. २८ तारखेला फोन आला.'
  expect(readTranslation('```text\nOn the 28th Rs 40,000 went. A call came on the 28th.\n```', original)).toEqual({ kind: 'draft', text: 'On the 28th Rs 40,000 went. A call came on the 28th.', missing: [] })
  expect(readTranslation('Translation: On the 29th Rs 4,000 went.', original)).toEqual({ kind: 'draft', text: 'On the 29th Rs 4,000 went.', missing: ['28', '40000'] })
  expect(readTranslation('English translation:  Rs 40000 on 28.', original)).toMatchObject({ text: 'Rs 40000 on 28.', missing: [] })
})

test('an empty or too long answer is no draft', () => {
  expect(readTranslation('   ', 'x')).toEqual({ kind: 'empty' })
  expect(readTranslation('```\n```', 'x')).toEqual({ kind: 'empty' })
  expect(readTranslation('a'.repeat(40001), 'x')).toEqual({ kind: 'empty' })
  expect(readTranslation('a'.repeat(40000), 'x')).toMatchObject({ kind: 'draft' })
})
