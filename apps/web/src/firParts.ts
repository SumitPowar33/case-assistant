import type { Key } from './i18n'

// The parts of the FIR screen. On a desktop each is a page of its own, named in the sidebar (design boards 2 to 10:
// #/firs/{id}/{part}); without a part the whole case file shows. On a phone one part shows at a time, chosen at the top.
export const PARTS = ['case', 'people', 'arrests', 'chargesheets', 'closure', 'deadlines', 'evidence', 'notices', 'readiness', 'statements', 'money', 'finalReport', 'diary'] as const
export type Part = typeof PARTS[number]
export const PART_LABEL: Record<Part, Key> = {
  case: 'fir.partCase', people: 'fir.people', arrests: 'arrest.heading', chargesheets: 'cs.heading', closure: 'closure.heading',
  deadlines: 'fir.deadlines', evidence: 'fir.evidence', notices: 'notice.heading', readiness: 'readiness.title', statements: 'statement.part', money: 'money.part', finalReport: 'fr.part', diary: 'diary.part',
}
export const isPart = (p: string | undefined): p is Part => !!p && (PARTS as readonly string[]).includes(p)
