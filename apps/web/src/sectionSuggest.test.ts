import { expect, test } from 'vitest'
import { readSuggestions, sectionPrompt, type Charge, graverFirst } from './sectionSuggest'

// Fictional data only.
const TEXT = 'A caller said he was from my bank. He asked me for a code sent to my phone.\nRs 40,000 went out of my account.'
const charge = (charge_id: string, law: string, ingredients: string[], in_fir = false): Charge => ({
  playbook_id: 'cyber-fraud', charge_id, act: law.startsWith('IT Act') ? 'IT Act' : 'BNS', law, label: `Label of ${charge_id}`,
  ingredients: ingredients.map((id) => ({ id, text: `Text of ${id}` })), in_fir })
const CHARGES = [
  charge('cheating', 'BNS 318(4)', ['deception', 'delivery'], true),
  charge('personation', 'BNS 319(2)', ['pretended_identity', 'no_such_officer']),
  charge('it_personation', 'IT Act 66D', ['computer_resource', 'personation']),
]
const ing = (id: string, quote: unknown) => ({ id, quote })

test('the prompt names every charge with its id, law, label and ingredients, the text, and asks for no judgement', () => {
  const p = sectionPrompt(TEXT, CHARGES)
  expect(p).toContain('cyber-fraud/it_personation: IT Act 66D, Label of it_personation. Ingredients: computer_resource: Text of computer_resource; personation: Text of personation')
  expect(p).toContain('<<<\n' + TEXT + '\n>>>')
  expect(p).toContain('do not decide whether anything is proved, whether anyone is guilty')
  expect(p).toContain('Do not name people.')
})

test('a charge is suggested with the ingredients whose quote is words of the text, in the playbooks order', () => {
  const draft = 'Here you are:\n```json\n' + JSON.stringify([
    { charge: 'cyber-fraud/it_personation', ingredients: [ing('computer_resource', 'a code sent to my phone'), ing('personation', 'A caller said he was from my bank')] },
    { charge: 'cyber-fraud/cheating', ingredients: [ing('delivery', 'Rs 40,000 went out of my account')] },
  ]) + '\n```'
  const r = readSuggestions(draft, TEXT, CHARGES)
  expect(r).toEqual({ kind: 'suggestions', dropped: 0, suggestions: [
    { charge: CHARGES[0], met: [{ id: 'delivery', quote: 'Rs 40,000 went out of my account', at: TEXT.indexOf('Rs 40,000') }] },
    { charge: CHARGES[2], met: [{ id: 'computer_resource', quote: 'a code sent to my phone', at: TEXT.indexOf('a code') },
      { id: 'personation', quote: 'A caller said he was from my bank', at: 0 }] },
  ] })
})

test('a quote across a line break keeps the words of the text', () => {
  const r = readSuggestions(JSON.stringify([{ charge: 'cyber-fraud/cheating', ingredients: [ing('delivery', 'my phone. Rs 40,000')] }]), TEXT, CHARGES)
  expect(r.kind === 'suggestions' && r.suggestions[0].met[0].quote).toBe('my phone.\nRs 40,000')
})

test('unknown charges and ingredients, quotes not in the text, repeats and odd entries are dropped and counted', () => {
  const draft = JSON.stringify([
    { charge: 'cyber-fraud/murder', ingredients: [ing('x', 'A caller')] },                       // no such charge
    { charge: 'personation', ingredients: [ing('pretended_identity', 'A caller')] },             // the playbook is part of the id
    { charge: 'cyber-fraud/personation', ingredients: [
      ing('pretended_identity', 'he was from my bank'),
      ing('pretended_identity', 'A caller'),                                                        // the same ingredient again
      ing('deception', 'A caller'),                                                                 // another charge's ingredient
      ing('no_such_officer', 'he was a CBI officer'),                                               // not words of the text
      ing('no_such_officer', 42), 'odd', null,
      ing('no_such_officer', 'x'.repeat(501)),
    ] },
    { charge: 'cyber-fraud/personation', ingredients: [ing('no_such_officer', 'A caller')] },     // the same charge again
    { charge: 'cyber-fraud/it_personation', ingredients: 'all of them' },                         // not a list
    { charge: 'cyber-fraud/cheating', ingredients: [ing('deception', 'not in it')] },              // nothing left: not suggested
    'odd', null, 7,
  ])
  const r = readSuggestions(draft, TEXT, CHARGES)
  expect(r.kind === 'suggestions' && r.suggestions.map((s) => [s.charge.charge_id, s.met.map((m) => m.id)])).toEqual([['personation', ['pretended_identity']]])
  expect(r.kind === 'suggestions' && r.dropped).toBe(15)
})

test('an answer that is not a JSON list cannot be read; an empty list suggests nothing', () => {
  expect(readSuggestions('BNS 319(2) applies.', TEXT, CHARGES)).toEqual({ kind: 'unreadable' })
  expect(readSuggestions('{"charge": "cyber-fraud/cheating"}', TEXT, CHARGES)).toEqual({ kind: 'unreadable' })
  expect(readSuggestions('[]', TEXT, CHARGES)).toEqual({ kind: 'suggestions', suggestions: [], dropped: 0 })
})

test('a charge graver than every section on the FIR comes first; the others keep their order', () => {
  const c = (id: string, graver: boolean) => ({ playbook_id: 'p', charge_id: id, act: 'BNS', law: `BNS ${id}`, label: id, ingredients: [], in_fir: false, graver })
  const read = { kind: 'suggestions' as const, dropped: 0, suggestions: [{ charge: c('a', false), met: [] }, { charge: c('b', true), met: [] }, { charge: c('c', false), met: [] }] }
  const sorted = graverFirst(read)
  expect(sorted.kind === 'suggestions' && sorted.suggestions.map((s) => s.charge.charge_id)).toEqual(['b', 'a', 'c'])
  expect(graverFirst({ kind: 'unreadable' })).toEqual({ kind: 'unreadable' })
})
