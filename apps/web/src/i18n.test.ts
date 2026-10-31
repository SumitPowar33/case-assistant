import { expect, test } from 'vitest'
import { REVIEWED, SCREEN_LANGS, translate, translateCode, translateServer } from './i18n'
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

test('a server message is shown in the screen language when a server text matches it whole, with its values kept', () => {
  expect(translateServer('mr', 'Only the case team can do this.')).toBe('फक्त प्रकरणाची टीम हे करू शकते.')
  expect(translateServer('mr', 'The first remand cannot be after today.')).toBe('पहिला रिमांड आजनंतरचा असू शकत नाही.')
  expect(translateServer('hi', 'The update cannot be before the FIR was registered.')).toBe('जानकारी एफआईआर दर्ज होने से पहले की नहीं हो सकती।')
  expect(translateServer('hi', 'The unit above already asks for 30 or less; a unit can only be stricter, never looser.'))
    .toBe('ऊपर की इकाई पहले से 30 या उससे कम माँगती है; इकाई केवल अधिक सख़्त हो सकती है, कभी ढीली नहीं।')
  expect(translateServer('ta', 'Too many wrong passwords. Try again after 21:15 IST.')).toBe('பல முறை தவறான கடவுச்சொல். 21:15 IST க்குப் பிறகு மீண்டும் முயலவும்.')
  // the most specific text wins: "answered {status} for {path}", not "answered {status}" with the path swallowed
  expect(translateServer('mr', 'The server answered 500 for /firs')).toBe('सर्व्हरने /firs साठी 500 उत्तर दिले')
  expect(translateServer('mr', 'The server answered 500')).toBe('सर्व्हरने 500 उत्तर दिले')
  expect(translateServer('mr', 'Only the case team can do this. And more.')).toBe('Only the case team can do this. And more.')   // whole message only
  expect(translateServer('mr', 'A message no catalog knows (x+y)?')).toBe('A message no catalog knows (x+y)?')
  expect(translateServer('en', 'Only the case team can do this.')).toBe('Only the case team can do this.')
})
