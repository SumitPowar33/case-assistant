// AI draft of the 90-day letter to the victim or informant (design board 11's deadlines, AI feature A7, gateway feature
// victim_update, plan section 3). Plain logic, no screen: the prompt sent to the gateway, and the check of its answer.
// Only the FIR number, the day it was registered and the generic steps the officer ticks are sent: no name, no text of
// the file, no evidence, so nothing protected can reach the AI provider, whatever the case. A letter that gives an
// opinion on guilt or truthfulness, or promises an outcome, is not shown; a number that is not in the facts is listed
// for the officer to look at. Change LETTER_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { judges } from './chargesheetDraft'
import { LANGUAGE_NAMES, numbers } from './statementTranslate'

export const LETTER_PROMPT_VERSION = 'victim_update/letter@1'
/** The steps the officer may tell the victim about: generic, never a detail of the case. */
export const STEPS = ['statements', 'evidence', 'enquiries', 'expert'] as const
export type Step = (typeof STEPS)[number]
const STEP_TEXT: Record<Step, string> = {
  statements: 'statements of people who know about the matter have been recorded',
  evidence: 'material connected with the matter has been collected and kept safe',
  enquiries: 'information has been asked from banks, telecom companies or other offices',
  expert: 'items have been sent to an expert or a laboratory for examination',
}
export const MAX_LETTER = 3000

export type Facts = { firNo: number; firYear: number; registered: Date; steps: Step[] }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The registration day in India time as day, month number, month name and year. */
const ist = (d: Date) => {
  const p = new Date(d.getTime() + 5.5 * 3600_000)
  return { day: p.getUTCDate(), month: p.getUTCMonth() + 1, year: p.getUTCFullYear() }
}

/** The text sent to the gateway. Written in English whatever the screen language; the letter is in `language`. */
export function letterPrompt(f: Facts, language: string): string {
  const r = ist(f.registered)
  const into = LANGUAGE_NAMES[language] ?? 'English'
  return [
    `Write a short letter from a police station to the person who reported a crime, in ${into}, in plain everyday words and short sentences (under 150 words).`,
    'It tells them how the investigation is going, as the law requires within 90 days (BNSS 193(3)(ii)). Use only these facts:',
    `- the FIR number is ${f.firNo}/${f.firYear}, registered on ${r.day} ${MONTHS[r.month - 1]} ${r.year}`,
    ...f.steps.map((s) => `- ${STEP_TEXT[s]}`),
    '- the investigation is continuing; they may contact the investigating officer at the police station',
    'Rules: write only the facts above and no other number or date. Do not name anyone. Do not give any detail of evidence, witnesses or suspects.',
    'Never say or suggest that anyone is guilty or innocent, never promise an arrest, a punishment or a result, and never say how long the case will take.',
    'Answer with only the letter, without a title or a list.',
  ].join('\n')
}

export type Letter = { kind: 'letter'; text: string; odd: string[] } | { kind: 'refused'; why: 'opinion' | 'promise' } | { kind: 'empty' }

// words that promise an outcome the police cannot promise
const PROMISE = /\b(will|shall|would) (definitely |certainly |surely )?(be |get )?(arrest\w*|punish\w*|caught|convict\w*|jail\w*|recover\w*|return\w*|refund\w*)\b|\b(guarantee\w*|assure\w*|promise\w*|certainly|definitely)\b/i

/** The answer checked: empty, an opinion or a promise (not shown), or the letter with the numbers that are not in the facts. */
export function readLetter(answer: string, f: Facts): Letter {
  const text = answer.trim()
  if (!text || text.length > MAX_LETTER) return { kind: 'empty' }
  if (judges(text)) return { kind: 'refused', why: 'opinion' }
  if (PROMISE.test(text)) return { kind: 'refused', why: 'promise' }
  const r = ist(f.registered)
  const known = new Set([f.firNo, f.firYear, r.day, r.month, r.year].map(String))
  const odd = [...new Set(numbers(text).map((n) => String(Number(n))).filter((n) => !known.has(n)))]
  return { kind: 'letter', text, odd }
}

/** The decision logged in the gateway for a letter the officer used: as drafted, or with the officer's changes. */
export const decisionFor = (drafted: string, used: string): 'accepted' | 'edited' => (used.trim() === drafted.trim() ? 'accepted' : 'edited')
