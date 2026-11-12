import type { User } from './api'
import type { Key } from './i18n'
import { PARTS, PART_LABEL, type Part } from './firParts'

// The screens a user can open, in menu order: the menu, the tour and the help chat all read this one list, so they always
// show the same screens, in the same words, and only the ones this user's permissions open.
export type Group = 'main' | 'case' | 'station' | 'tools' | 'admin'
export type Screen = { href: string; label: Key; about: Key; group: Group; keys: string[] }   // keys: its screen texts' key prefixes

const PART_ABOUT: Record<Part, Key> = {
  case: 'about.case', people: 'about.people', arrests: 'about.arrests', chargesheets: 'about.chargesheets', closure: 'about.closure',
  deadlines: 'about.deadlines', evidence: 'about.evidence', search: 'search.lede', notices: 'about.notices', readiness: 'about.readiness',
  statements: 'statement.lede', money: 'money.lede', finalReport: 'fr.lede', diary: 'diary.lede', ask: 'ask.lede',
}
const PART_KEYS: Record<Part, string[]> = {
  case: ['fir', 'facts', 'sections'], people: ['person', 'personForm', 'io', 'victim'], arrests: ['arrest'], chargesheets: ['cs'], closure: ['closure'], deadlines: ['deadline'],
  evidence: ['evidence', 'evForm', 'cert'], search: ['search'], notices: ['notice'], readiness: ['readiness'], statements: ['statement', 'translate'],
  money: ['money'], finalReport: ['fr', 'csd'], diary: ['diary'], ask: ['ask'],
}

export function screensFor(user: User, firId?: string): Screen[] {
  const has = (p: string) => user.permissions?.includes(p) ?? false
  const atStation = !!user.station_id
  const s = (href: string, label: Key, about: Key, group: Group, keys: string[], show = true): Screen[] =>
    show ? [{ href, label, about, group, keys }] : []
  return [
    ...s('#/', 'nav.dashboard', 'about.dashboard', 'main', ['dash']),
    ...s('#/firs', 'nav.firs', 'about.firs', 'main', ['firs']),
    ...s('#/front-desk', 'nav.frontDesk', 'desk.intro', 'main', ['desk', 'complaint', 'steps', 'sign', 'firForm'], atStation),
    ...(firId ? [
      ...s(`#/firs/${firId}`, 'nav.wholeCase', 'about.wholeCase', 'case', ['fir']),
      ...PARTS.flatMap((p) => s(`#/firs/${firId}/${p}`, PART_LABEL[p], PART_ABOUT[p], 'case', PART_KEYS[p])),
    ] : []),
    ...s('#/policies', 'nav.policies', 'policies.intro', 'station', ['policies']),
    ...s('#/import', 'nav.import', 'import.intro', 'station', ['import'], !!user.can_import),
    ...s('#/property', 'nav.property', 'prop.intro', 'station', ['prop'], atStation),
    ...s('#/expert', 'nav.expert', 'exp.intro', 'station', ['exp'], atStation),
    ...s('#/court', 'nav.court', 'court.intro', 'station', ['court'], atStation),
    ...s('#/supervisor', 'nav.supervisor', 'sup.intro', 'station', ['sup'], has('chargesheet.approve')),
    ...s('#/reads', 'nav.reads', 'reads.intro', 'station', ['reads'], has('audit.read_protected')),
    ...s('#/audit', 'nav.audit', 'audit.intro', 'station', ['audit'], has('audit.read_protected')),
    ...s('#/state-setup', 'nav.state', 'state.intro', 'station', ['state'], has('pack.propose') || has('pack.approve')),
    ...s('#/acting', 'nav.acting', 'acting.intro', 'station', ['acting'], has('acting.grant')),
    ...s('#/type', 'nav.type', 'about.type', 'tools', ['type', 'typing', 'gloss']),
    ...s('#/laws', 'nav.laws', 'laws.intro', 'tools', ['laws']),
    ...s('#/password', 'nav.password', 'about.password', 'tools', ['password']),
    ...s('#/admin', 'nav.admin', 'about.admin', 'admin', ['admin'], has('admin.manage')),
    ...s('#/settings', 'nav.settings', 'settings.intro', 'admin', ['settings', 'aiFeature'], has('admin.manage')),
  ]
}
