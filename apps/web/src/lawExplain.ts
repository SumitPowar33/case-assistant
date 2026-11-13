// AI explanation for the old law to new law finder (design board 18, AI feature A8, gateway feature law_explain, plan
// section 3). The table in the national pack is data and stays the answer; the AI only explains it in plain words. Plain
// logic, no screen: the prompt sent to the gateway and the check of its answer. Only the two section numbers and the
// table's own short description go to the gateway: nothing from any case, so it is offered to every signed-in officer.
// Change EXPLAIN_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { judges } from './chargesheetDraft'
import { LANGUAGE_NAMES, numbers } from './statementTranslate'

export const EXPLAIN_PROMPT_VERSION = 'law_explain/explain@1'
export const MAX_EXPLANATION = 2000

export type Entry = { law: string; newLaw: string; from: string; to: string | null; what: string; partial: boolean }

/** The text sent to the gateway. Written in English whatever the screen language; the explanation is in `language`. */
export function explainPrompt(e: Entry, language: string): string {
  const into = LANGUAGE_NAMES[language] ?? 'English'
  return [
    `A police officer looks up how an old Indian law section moved into the new criminal laws. Explain it in ${into}, in plain everyday words and short sentences (under 120 words).`,
    `- old: ${e.law} section ${e.from}`,
    `- new: ${e.newLaw} section ${e.to}`,
    `- the table describes the subject as: ${e.what}${e.partial ? ' (the new section only partly matches the old one)' : ''}`,
    'Say what the section is about, that the new section took its place, and in what way the new section may differ from the old one, only where you are sure.',
    'Do not talk about any case or person, do not say whether anyone committed an offence, and do not give legal advice. Add one sentence telling the officer to read the section in the Act.',
    'Answer with only the explanation, without a title or a list.',
  ].join('\n')
}

export type Explained = { kind: 'text'; text: string; odd: string[] } | { kind: 'refused' } | { kind: 'empty' }

/** The answer checked: empty, or an opinion on guilt or truthfulness (not shown), or the text with the numbers that are not in the table. */
export function readExplanation(answer: string, e: Entry): Explained {
  const text = answer.trim()
  if (!text || text.length > MAX_EXPLANATION) return { kind: 'empty' }
  if (judges(text)) return { kind: 'refused' }
  const known = new Set(numbers(`${e.from} ${e.to ?? ''}`).map((n) => String(Number(n))))
  const odd = [...new Set(numbers(text).map((n) => String(Number(n))).filter((n) => !known.has(n)))]
  return { kind: 'text', text, odd }
}
