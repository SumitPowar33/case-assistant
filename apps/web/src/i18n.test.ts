import { expect, test } from 'vitest'
import { REVIEWED, SCREEN_LANGS, translate, translateCode } from './i18n'
import nationalModule from '../../../packs/IN/module.json'

const files = import.meta.glob<Record<string, string>>('./i18n/*.json', { eager: true, import: 'default' })
const read = (code: string) => files[`./i18n/${code}.json`]
const en = read('en')
// the script each language is written in (Unicode block start), so a value pasted into the wrong file is caught
const SCRIPT: Record<string, number> = { hi: 0x900, mr: 0x900, bn: 0x980, pa: 0xa00, gu: 0xa80, or: 0xb00, ta: 0xb80, te: 0xc00, kn: 0xc80, ml: 0xd00 }

test('there is a screen catalog for every language of the national module, English first', () => {
  expect([...SCREEN_LANGS].sort()).toEqual([...nationalModule.languages].sort())
  expect(Object.keys(files).length).toBe(nationalModule.languages.length)
  expect(SCREEN_LANGS[0]).toBe('en')
  expect([...REVIEWED]).toEqual(['en'])   // the others are drafts until a native speaker checks them
})

test.each(Object.keys(SCRIPT))('the %s catalog has every English key, nothing empty, in its own script', (code) => {
  const c = read(code)
  expect(Object.keys(c).sort()).toEqual(Object.keys(en).sort())
  for (const [key, text] of Object.entries(c)) {
    expect(text.trim(), key).not.toBe('')
    // a translation must keep every {name} of the English text, or the screen would lose that value (a date, a number)
    expect((text.match(/\{\w+\}/g) ?? []).sort(), `${code} ${key} placeholders`).toEqual((en[key].match(/\{\w+\}/g) ?? []).sort())
    expect([...text].some((ch) => ch.codePointAt(0)! >= SCRIPT[code] && ch.codePointAt(0)! < SCRIPT[code] + 0x80), `${code} ${key}`).toBe(true)
  }
})

test('a missing key or an unknown language falls back to English', () => {
  expect(translate('xx', 'nav.firs')).toBe('FIRs')
  expect(translate('mr', 'nav.firs')).toBe('एफआयआर')
})

test('values fill the {name} places; a place without a value stays visible', () => {
  expect(translate('en', 'fir.title', { no: 9, year: 2026 })).toBe('FIR 9/2026')
  expect(translate('mr', 'fir.dueBy', { kind: 'K', date: '2026-11-30' })).toBe('K: 2026-11-30 पर्यंत')
  expect(translate('en', 'fir.title', { no: 9 })).toBe('FIR 9/{year}')
})

test('a code from the server is shown by its label, or as it is when no catalog knows it', () => {
  expect(translateCode('en', 'person', 'accused')).toBe('accused')
  expect(translateCode('ta', 'person', 'witness')).toBe('சாட்சி')
  expect(translateCode('mr', 'person', 'a_new_role')).toBe('a_new_role')
})
