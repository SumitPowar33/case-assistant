// AI drafting of the final report's narrative (design board 10, AI feature A6, gateway feature chargesheet_draft, plan
// section 7). Plain logic, no screen: the prompt sent to the gateway, and the check of its answer against the case file.
// The AI writes only the two narrative parts (facts in brief; evidence for the charges), one sentence at a time, each
// naming the piece of the file it comes from and quoting its words. A sentence is shown only when its quote is words of
// that piece; a sentence that gives an opinion on guilt or on whether someone is truthful is dropped (that line is the
// officer's own). Change DRAFT_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { jsonList, locate } from './factCheck'
import { LANGUAGE_NAMES } from './statementTranslate'

export const DRAFT_PROMPT_VERSION = 'chargesheet_draft/narrative@1'
export const PARTS = ['facts', 'evidence'] as const
export type Part = (typeof PARTS)[number]
/** One piece of the case file the AI may use: the FIR text, a statement as said, or its checked English translation. */
export type Source = { id: string; kind: 'fir' | 'statement' | 'translation'; who: string | null; date: string | null; text: string }
export type Sentence = { part: Part; text: string; source: Source; quote: string }
export type DraftRead = { kind: 'sentences'; sentences: Sentence[]; dropped: number; opinions: number } | { kind: 'unreadable' }

const MAX_SENTENCES = 60
const MAX_SENTENCE = 600
const MAX_QUOTE = 500

// Words that judge a person: guilt, innocence, truthfulness, or that the case is proved. A sentence with one is not shown.
const OPINION = /\b(guilt\w*|innocen\w*|culprit\w*|convict\w*|credib\w*|truthful\w*|untruthful|lying|liars?|lied|believab\w*|unbelievab\w*|trustworth\w*|untrustworth\w*|honest\w*|dishonest\w*|reliab\w*|unreliab\w*)\b|\b(proved|proven|established|clear) beyond\b|\b(is|are|stands?|was|were|has been|have been) (clearly |fully |thus |therefore )?(proved|proven|established)\b|\bcommitted the (offence|crime)\b/i

/** True when a sentence gives an opinion on guilt, on truthfulness or that the charge is proved. */
export const judges = (sentence: string) => OPINION.test(sentence)

/** The text sent to the gateway. Written in English whatever the screen language; the answer is in `language`. */
export function draftPrompt(sources: Source[], sections: string, language: string): string {
  const into = LANGUAGE_NAMES[language] ?? 'English'
  return [
    'Below are pieces of a police case file, each with an id. Draft the two narrative parts of the final report (BNSS 193):',
    '"facts" (the facts of the case in brief, in the order they happened) and "evidence" (what the file holds for each charge' + (sections ? `: ${sections}` : '') + ').',
    'Answer with only a JSON list. Each entry is an object with four strings: "part" ("facts" or "evidence"), "text" (one sentence, in ' + into + '),',
    '"source" (the id of the one piece it comes from) and "quote" (the words of that piece it rests on, copied exactly, character for character, at most 200 characters).',
    'Rules: use only what the pieces say; never guess or add a fact. Write who said what ("the complainant stated that ..."), not that it is true.',
    'Never say or suggest that anyone is guilty or innocent, truthful or lying, or that a charge is proved: that is for the officer and the court.',
    'If the pieces say nothing for a charge, leave it out.',
    ...sources.flatMap((s) => [`Piece ${s.id}${s.kind === 'statement' ? ' (statement)' : s.kind === 'translation' ? ' (English translation of a statement)' : ' (FIR text)'}:`, '<<<', s.text, '>>>']),
  ].join('\n')
}

/** The answer checked against the file: the sentences that point at words of the piece they name, and how many did not. */
export function readDraft(draft: string, sources: Source[]): DraftRead {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const byId = new Map(sources.map((s) => [s.id, s]))
  const sentences: Sentence[] = []
  const seen = new Set<string>()
  let dropped = 0, opinions = 0
  for (const x of list) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const part = typeof e.part === 'string' ? e.part.trim().toLowerCase() : ''
    const text = typeof e.text === 'string' ? e.text.trim().replace(/\s+/g, ' ') : ''
    const source = typeof e.source === 'string' ? byId.get(e.source.trim()) : undefined
    const found = source && typeof e.quote === 'string' && e.quote.length <= MAX_QUOTE ? locate(source.text, e.quote) : null
    if (!(PARTS as readonly string[]).includes(part) || !text || text.length > MAX_SENTENCE || !found || found.quote.length > MAX_QUOTE) { dropped++; continue }
    if (judges(text)) { opinions++; continue }
    const key = `${part}|${text.toLowerCase()}`
    if (seen.has(key) || sentences.length >= MAX_SENTENCES) continue
    seen.add(key)
    sentences.push({ part: part as Part, text, source: source!, quote: found.quote })
  }
  return { kind: 'sentences', sentences, dropped, opinions }
}

/** The kept sentences of one part as a paragraph after what the officer has written, each followed by its source mark. */
export function appendTo(written: string, kept: Sentence[], part: Part, cite: (s: Source) => string): string {
  const add = kept.filter((s) => s.part === part).map((s) => `${s.text} (${cite(s.source)})`).join(' ')
  if (!add) return written
  return written.trim() ? `${written.trimEnd()}\n\n${add}` : add
}

/** The decision logged in the gateway: all shown sentences kept, some, or none (an unreadable answer is rejected). */
export function decisionFor(read: DraftRead, kept: number): 'accepted' | 'edited' | 'rejected' {
  if (read.kind === 'unreadable' || kept === 0) return 'rejected'
  return kept < read.sentences.length ? 'edited' : 'accepted'
}
