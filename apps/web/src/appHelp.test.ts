import { expect, test } from 'vitest'
import { NOT_IN_APP, checkHelp, helpMaterial, helpPrompt, screenTexts } from './appHelp'
import { screensFor } from './screens'
import type { User } from './api'

// Fictional accounts only.
const io: User = { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1', permissions: [] }
const admin: User = { ...io, station_id: null, permissions: ['admin.manage'] }

test('the screens follow the permissions, and an open FIR adds its parts', () => {
  const hrefs = (u: User, fir?: string) => screensFor(u, fir).map((s) => s.href)
  expect(hrefs(io)).toContain('#/front-desk')
  expect(hrefs(io)).not.toContain('#/admin')
  expect(hrefs(admin)).toContain('#/admin')
  expect(hrefs(admin)).not.toContain('#/front-desk')   // no station, no front desk
  expect(hrefs(io).some((h) => h.startsWith('#/firs/'))).toBe(false)
  expect(hrefs(io, 'f1')).toContain('#/firs/f1/readiness')
})

test('a screen texts are its own labels, in the screen language and in English', () => {
  const desk = screensFor(io).find((s) => s.href === '#/front-desk')!
  expect(screenTexts(desk, 'en')).toContain('Write the information down')
  const mr = screenTexts(desk, 'mr')
  expect(mr).toMatch(/[ऀ-ॿ]/)
  expect(mr).toContain('Write the information down')
  expect(screenTexts(desk, 'en')).not.toContain('Sign in')   // nothing from other screens
})

test('every screen is sent by name; only the matching ones and the open one carry their texts', () => {
  const screens = screensFor(io)
  const m = helpMaterial('How do I write down a complaint at the front desk?', screens, 'en', '#/laws')
  expect(m.map((x) => x.tag)).toEqual(screens.map((_, i) => `S${i + 1}`))
  const withTexts = m.filter((x) => x.texts).map((x) => x.href)
  expect(withTexts).toContain('#/front-desk')
  expect(withTexts).toContain('#/laws')
  expect(withTexts.length).toBeLessThanOrEqual(4)
  const p = helpPrompt('How do I write down a complaint at the front desk?', m, '#/laws')
  expect(p).toContain('The officer has this screen open now: [')
  expect(p).toContain(`reply with exactly: ${NOT_IN_APP}`)
  expect(p).toMatch(/\[S\d+\] Front desk: Write the information down/)
})

test('the answer links only the screens it names that were sent; none named is marked; not in the app says so', () => {
  const m = helpMaterial('front desk', screensFor(io), 'en', '#/')
  const desk = m.find((x) => x.href === '#/front-desk')!
  expect(checkHelp(`Go to the Front desk [${desk.tag}] and press Sign [S99].`, m)).toMatchObject({ kind: 'found', screens: [desk] })
  expect(checkHelp('Press the button.', m)).toMatchObject({ kind: 'unsourced', screens: [] })
  expect(checkHelp(`${NOT_IN_APP} [S1]`, m)).toMatchObject({ kind: 'notInApp', screens: [] })
})
