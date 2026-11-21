import { expect, test } from 'vitest'
import { comparePrompt, readDifferences } from './statementCompare'

// Fictional data only.
const sources = [
  { id: 'FIR', text: 'The complainant sent Rs 40,000 on 22 August to the account of the caller.' },
  { id: 'S1', text: 'I sent the money on 23 August after the second call.' },
  { id: 'S2', text: 'मी २२ तारखेला पैसे पाठवले.' },
]
const entry = (a: unknown, b: unknown, topic: unknown = 'date of payment') => ({ topic, a, b })
const side = (source: string, quote: string) => ({ source, quote })

test('the prompt names every source by id, holds no name and forbids saying who is right', () => {
  const p = comparePrompt(sources)
  expect(p).toContain('Source FIR:')
  expect(p).toContain('Source S2:')
  expect(p).toContain('मी २२ तारखेला पैसे पाठवले.')
  expect(p).toMatch(/Do not say which source is right, whether anyone is lying/)
})

test('a difference is kept only when both quotes are words of two different named sources', () => {
  const draft = JSON.stringify([
    entry(side('FIR', 'on 22 August'), side('S1', 'on 23 August')),
    entry(side('fir', 'Rs 40,000'), side('S2', 'मी २२ तारखेला')),                 // source ids are read in any case
    entry(side('FIR', 'on 22 August'), side('FIR', 'Rs 40,000')),                  // the same source twice
    entry(side('FIR', 'on 24 August'), side('S1', 'on 23 August')),                // a quote that is not in its source
    entry(side('FIR', 'on 22 August'), side('S9', 'on 23 August')),                // an unknown source
    entry(side('FIR', 'on 22 August'), 'S1'),                                      // not an object
    entry(side('FIR', 'on 22 August'), side('S1', 'x'.repeat(501))),               // an over-long quote
    entry(side('FIR', 'on 22 August'), side('S1', 'on 23 August'), ''),            // no topic
    entry(side('FIR', 'on 22 August'), side('S1', 'on 23 August'), 'x'.repeat(201)),
    null,
    entry(side('FIR', 'on 22 August'), { source: 5, quote: 'on 23 August' }),
  ])
  const r = readDifferences(`Here you go:\n${draft}`, sources)
  expect(r.kind).toBe('differences')
  if (r.kind !== 'differences') return
  expect(r.differences.map((d) => [d.a.source, d.b.source])).toEqual([['FIR', 'S1'], ['FIR', 'S2']])
  expect(r.dropped).toBe(9)
})

test('at most twenty differences are kept, and an empty list or an unreadable answer is told apart', () => {
  const many = JSON.stringify(Array.from({ length: 25 }, () => entry(side('FIR', 'on 22 August'), side('S1', 'on 23 August'))))
  const r = readDifferences(many, sources)
  expect(r).toMatchObject({ kind: 'differences', dropped: 5 })
  expect(readDifferences('[]', sources)).toEqual({ kind: 'differences', differences: [], dropped: 0 })
  expect(readDifferences('I cannot tell.', sources)).toEqual({ kind: 'unreadable' })
})

test('a topic that says who lies or is believable is dropped, in English, Hindi and Marathi (weekly review 21 Nov)', () => {
  const ok = [side('FIR', 'on 22 August'), side('S1', 'on 23 August')] as const
  const r = readDifferences(JSON.stringify([
    entry(...ok, 'W1 is lying about the date'),
    entry(...ok, 'the date S1 gives is not credible'),
    entry(...ok, 'S1 झूठ बोल रहा है'),
    entry(...ok, 'S1 खोटे बोलत आहे'),
    entry(...ok, 'date of payment'),
  ]), sources)
  expect(r).toMatchObject({ kind: 'differences', dropped: 4 })
  if (r.kind === 'differences') expect(r.differences.map((d) => d.topic)).toEqual(['date of payment'])
})
