import { expect, test } from 'vitest'
import { fmt, istIso, parseSections, text } from './formats'

// Fictional data only.
test('sections are read with commas or semicolons, any letter case, a "section" word and the longest act name first', () => {
  expect(parseSections('BNS 318(4), IT Act 66D; bns sec. 3.1(a) ,  NDPS Act Section 20/b ,')).toEqual([
    { act: 'BNS', section: '318(4)' }, { act: 'IT Act', section: '66D' }, { act: 'BNS', section: '3.1(a)' }, { act: 'NDPS Act', section: '20/b' }])
  expect(parseSections('')).toEqual([])
  expect(parseSections('Arms Act s. 25')).toEqual([{ act: 'Arms Act', section: '25' }])
  expect(parseSections('SC/ST Act 3(1)(r)')).toEqual([{ act: 'SC/ST Act', section: '3(1)(r)' }])
})

test('a section that is not understood is refused by name: no act, no section, a section not starting with a digit, a space inside', () => {
  for (const bad of ['318(4)', 'BNS', 'BNS abc', 'BNS 3 18', 'BNSx 3', 'Fictional Act 3', 'BNS 3$'])
    expect(() => parseSections(bad), bad).toThrow(`Not understood: "${bad}". Write it like "BNS 318(4)" or "IT Act 66D".`)
  expect(() => parseSections('BNS 3, oops')).toThrow('Not understood: "oops"')
})

test('the act needs a space after it; "section" and "sec" words are dropped only in front, with or without a stop or space', () => {
  expect(() => parseSections('BNS318')).toThrow('Not understood: "BNS318"')
  expect(parseSections('BNS sec 5, BNS section5, BNS sec.6, BNS s.7, BNS 3s.4')).toEqual([
    { act: 'BNS', section: '5' }, { act: 'BNS', section: '5' }, { act: 'BNS', section: '6' }, { act: 'BNS', section: '7' }, { act: 'BNS', section: '3s.4' }])
})

test('a typed date and time becomes India time; anything else is refused', () => {
  expect(istIso('2026-10-01T14:05')).toBe('2026-10-01T14:05:00+05:30')
  for (const bad of ['', '2026-10-01', '2026-10-01T14:05:00', ' 2026-10-01T14:05', '2026-10-01T14:05 ', '26-10-01T14:05', '2026-1-01T14:05', '2026-10-1T14:05', '2026-10-01T4:05', '2026-10-01T14:5', 'x2026-10-01T14:05'])
    expect(() => istIso(bad), bad).toThrow('Give the date and time.')
})

test('a time is shown in India time whatever the clock zone', () => {
  expect(fmt('2026-10-01T23:30:00Z')).toBe('2 Oct 2026, 5:00 am IST')
})

test('a form field is trimmed, and empty or missing is null', () => {
  const f = new FormData()
  f.set('a', '  hello ')
  f.set('b', '   ')
  expect(text(f, 'a')).toBe('hello')
  expect(text(f, 'b')).toBeNull()
  expect(text(f, 'missing')).toBeNull()
})
