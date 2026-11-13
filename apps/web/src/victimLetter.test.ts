import { expect, test } from 'vitest'
import { LETTER_PROMPT_VERSION, decisionFor, letterPrompt, readLetter, type Facts } from './victimLetter'

// Fictional data only. 2026-11-03T20:00Z is 4 November 01:30 in India.
const facts: Facts = { firNo: 214, firYear: 2026, registered: new Date('2026-11-03T20:00:00Z'), steps: ['statements', 'expert'] }

test('the prompt carries only the FIR number, the India-time day, the ticked steps and the rules, in the language asked', () => {
  const p = letterPrompt(facts, 'mr')
  expect(p).toContain('in Marathi')
  expect(p).toContain('the FIR number is 214/2026, registered on 4 November 2026')
  expect(p).toContain('- statements of people who know about the matter have been recorded')
  expect(p).toContain('- items have been sent to an expert or a laboratory')
  expect(p).not.toContain('banks, telecom')
  expect(p).toContain('Never say or suggest that anyone is guilty or innocent')
  expect(letterPrompt({ ...facts, steps: [] }, 'xx')).toContain('in English')
  expect(LETTER_PROMPT_VERSION).toBe('victim_update/letter@1')
})

test('a plain letter is shown; numbers not in the facts are listed, the registration day in any form is known', () => {
  expect(readLetter('  FIR 214/2026 was registered on 04/11/2026. The inquiry is going on.  ', facts)).toEqual({ kind: 'letter', text: 'FIR 214/2026 was registered on 04/11/2026. The inquiry is going on.', odd: [] })
  expect(readLetter('एफआयआर २१४/२०२६, ९० दिवस, ५ जणांचे जबाब. ९०', facts)).toMatchObject({ kind: 'letter', odd: ['90', '5'] })
})

test('an empty or very long answer, an opinion and a promise are not shown', () => {
  expect(readLetter('   ', facts)).toEqual({ kind: 'empty' })
  expect(readLetter('a'.repeat(3001), facts)).toEqual({ kind: 'empty' })
  expect(readLetter('The accused is guilty and the case is proved beyond doubt.', facts)).toEqual({ kind: 'refused', why: 'opinion' })
  expect(readLetter('The person will be arrested soon.', facts)).toEqual({ kind: 'refused', why: 'promise' })
  expect(readLetter('We guarantee a result.', facts)).toEqual({ kind: 'refused', why: 'promise' })
  expect(readLetter('Your money will certainly come back.', facts)).toEqual({ kind: 'refused', why: 'promise' })
})

test('a letter used as drafted is accepted, one the officer changed is edited', () => {
  expect(decisionFor('Dear sir.', '  Dear sir. ')).toBe('accepted')
  expect(decisionFor('Dear sir.', 'Dear madam.')).toBe('edited')
})
