import { expect, test } from 'vitest'
import { EXPLAIN_PROMPT_VERSION, MAX_EXPLANATION, explainPrompt, readExplanation, type Entry } from './lawExplain'

// Fictional data only (section numbers are the public numbers of the Acts).
const murder: Entry = { law: 'IPC', newLaw: 'BNS', from: '302', to: '103', what: 'Murder: punishment', partial: false }
const electronic: Entry = { law: 'IEA', newLaw: 'BSA', from: '65B', to: '63', what: 'Electronic records', partial: true }

test('the prompt carries only the two section numbers and the table description, in the language asked', () => {
  const p = explainPrompt(murder, 'hi')
  expect(p).toContain('in Hindi')
  expect(p).toContain('IPC section 302')
  expect(p).toContain('BNS section 103')
  expect(p).toContain('Murder: punishment')
  expect(p).not.toContain('only partly')
  expect(p).toContain('do not say whether anyone committed an offence')
  expect(explainPrompt(electronic, 'xx')).toContain('in English')
  expect(explainPrompt(electronic, 'en')).toContain('only partly matches')
  expect(EXPLAIN_PROMPT_VERSION).toBe('law_explain/explain@1')
})

test('an explanation is shown with the numbers that are not in the table listed for checking', () => {
  expect(readExplanation('  BNS 103 took the place of IPC 302.  ', murder)).toEqual({ kind: 'text', text: 'BNS 103 took the place of IPC 302.', odd: [] })
  expect(readExplanation('Section 65B became 63, and 2023 is the year; also section 61.', electronic)).toEqual({
    kind: 'text', text: 'Section 65B became 63, and 2023 is the year; also section 61.', odd: ['2023', '61'] })
})

test('an empty, too long or opinionated explanation is not shown', () => {
  expect(readExplanation('   ', murder)).toEqual({ kind: 'empty' })
  expect(readExplanation('x'.repeat(MAX_EXPLANATION + 1), murder)).toEqual({ kind: 'empty' })
  expect(readExplanation('The accused is clearly guilty under this section.', murder)).toEqual({ kind: 'refused' })
  expect(readExplanation('x'.repeat(MAX_EXPLANATION), murder).kind).toBe('text')
})

test('an entry without a new section has no known numbers but its old one', () => {
  expect(readExplanation('Section 377 is not replaced.', { ...murder, from: '377', to: null })).toEqual({ kind: 'text', text: 'Section 377 is not replaced.', odd: [] })
})
