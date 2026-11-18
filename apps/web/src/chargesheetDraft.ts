// AI drafting of the final report's narrative (design board 10, AI feature A6, gateway feature chargesheet_draft, plan
// section 7). Plain logic, no screen: the prompt sent to the gateway, and the check of its answer against the case file.
// The AI writes only the two narrative parts (facts in brief; evidence for the charges), one sentence at a time, each
// naming the piece of the file it comes from and quoting its words. A sentence is shown only when its quote is words of
// that piece; a sentence that gives an opinion on guilt or on whether someone is truthful is dropped (that line is the
// officer's own). Change DRAFT_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { jsonList, locate } from './factCheck'
import { LANGUAGE_NAMES } from './statementTranslate'

export const DRAFT_PROMPT_VERSION = 'chargesheet_draft/narrative@2'
export const PARTS = ['facts', 'evidence'] as const
export type Part = (typeof PARTS)[number]
/** One piece of the case file the AI may use: the FIR text, a statement as said, its checked English translation, or a
 *  document of the file (evidence register entry, notice and its reply, 63(4) certificate, seizure or search memo,
 *  expert request, money trail), which `who` names by its title. */
export type Source = { id: string; kind: 'fir' | 'statement' | 'translation' | 'document'; who: string | null; date: string | null; text: string }
/** A charge's ingredient from the readiness check, with the labels of the evidence the file links to it. */
export type Ingredient = { id: string; charge: string; text: string; linked: string[] }
export type Sentence = { part: Part; text: string; source: Source; quote: string; ingredient?: Ingredient }
export type DraftRead = { kind: 'sentences'; sentences: Sentence[]; dropped: number; opinions: number } | { kind: 'unreadable' }

const MAX_SENTENCES = 60
const MAX_SENTENCE = 600
const MAX_QUOTE = 500

// Words that judge a person: guilt, innocence, truthfulness, or that the case is proved. A sentence with one is not shown.
const OPINION = /\b(guilt\w*|innocen\w*|culprit\w*|convict\w*|credib\w*|truthful\w*|untruthful|lying|liars?|lied|believab\w*|unbelievab\w*|trustworth\w*|untrustworth\w*|honest\w*|dishonest\w*|reliab\w*|unreliab\w*)\b|\b(proved|proven|established|clear) beyond\b|\b(is|are|stands?|was|were|has been|have been) (clearly |fully |thus |therefore )?(proved|proven|established)\b|\bcommitted the (offence|crime|theft|fraud|cheating|murder|robbery|assault)\b|\bresponsible for the (offence|crime|theft|fraud|cheating)\b|\b(is|are|was|were) (false|untrue|fabricated|a lie)\b|\bcharges? (is|are|stands?) (made out|proved|proven)\b|दोषी|निर्दोष|गुन्हेगार|अपराधी|मुजरिम|झूठ|अविश्वसनीय|विश्वसनीय|भरोसेमंद|विश्वासार्ह|अविश्वासार्ह|सच्चा|सच्ची|ईमानदार|बेईमान|प्रामाणिक|अप्रामाणिक|खोटा बोल|खोटे बोल|खोटं बोल|सिद्ध (हो गया|हो चुका|होता|झाले|झाला|झाली)|संदेह से परे|संशयापलीकडे|संशयापलिकडे/i

/** True when a sentence gives an opinion on guilt, on truthfulness or that the charge is proved. */
export const judges = (sentence: string) => OPINION.test(sentence)

/** The text sent to the gateway. Written in English whatever the screen language; the answer is in `language`. */
export function draftPrompt(sources: Source[], sections: string, language: string, ingredients: Ingredient[] = []): string {
  const into = LANGUAGE_NAMES[language] ?? 'English'
  return [
    'Below are pieces of a police case file, each with an id. Draft the two narrative parts of the final report (BNSS 193):',
    '"facts" (the facts of the case in brief, in the order they happened) and "evidence" (what the file holds for each charge' + (sections ? `: ${sections}` : '') + ').',
    'Answer with only a JSON list. Each entry is an object with four strings: "part" ("facts" or "evidence"), "text" (one sentence, in ' + into + '),',
    '"source" (the id of the one piece it comes from) and "quote" (the words of that piece it rests on, copied exactly, character for character, at most 200 characters).',
    'Rules: use only what the pieces say; never guess or add a fact. Write who said what ("the complainant stated that ..."), not that it is true.',
    'Never say or suggest that anyone is guilty or innocent, truthful or lying, or that a charge is proved: that is for the officer and the court.',
    'If the pieces say nothing for a charge, leave it out.',
    ...(ingredients.length ? [
      'Each ingredient below is one thing the court must be shown for a charge, with the evidence the officer has linked to it. For the "evidence" part write the sentences of one ingredient together and add a fifth string "ingredient" (its id).',
      'Leave an ingredient out when the pieces say nothing for it; never write that it is proved.',
      ...ingredients.map((i) => `Ingredient ${i.id}: ${i.charge}, ${i.text} (linked: ${i.linked.join('; ')})`)] : []),
    ...sources.flatMap((s) => [`Piece ${s.id}${s.kind === 'statement' ? ' (statement)' : s.kind === 'translation' ? ' (English translation of a statement)' : s.kind === 'document' ? ` (document: ${s.who})` : ' (FIR text)'}:`, '<<<', s.text, '>>>']),
  ].join('\n')
}

/** The answer checked against the file: the sentences that point at words of the piece they name, and how many did not. */
export function readDraft(draft: string, sources: Source[], ingredients: Ingredient[] = []): DraftRead {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const byId = new Map(sources.map((s) => [s.id, s]))
  const byIngredient = new Map(ingredients.map((i) => [i.id, i]))
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
    const ingredient = part === 'evidence' && typeof e.ingredient === 'string' ? byIngredient.get(e.ingredient.trim()) : undefined
    sentences.push({ part: part as Part, text, source: source!, quote: found.quote, ...(ingredient ? { ingredient } : {}) })
  }
  return { kind: 'sentences', sentences, dropped, opinions }
}

/** The kept sentences of one part as paragraphs after what the officer has written, each sentence followed by its source
 *  mark. In the evidence part the sentences of one ingredient make one paragraph that starts with the charge and the
 *  ingredient; the others make one paragraph. */
export function appendTo(written: string, kept: Sentence[], part: Part, cite: (s: Source) => string): string {
  const mine = kept.filter((s) => s.part === part)
  const line = (list: Sentence[]) => list.map((s) => `${s.text} (${cite(s.source)})`).join(' ')
  const paragraphs: string[] = []
  const general = mine.filter((s) => !s.ingredient)
  if (general.length) paragraphs.push(line(general))
  for (const id of new Set(mine.flatMap((s) => (s.ingredient ? [s.ingredient.id] : [])))) {
    const list = mine.filter((s) => s.ingredient?.id === id)
    paragraphs.push(`${list[0].ingredient!.charge}, ${list[0].ingredient!.text}: ${line(list)}`)
  }
  const add = paragraphs.join('\n\n')
  if (!add) return written
  return written.trim() ? `${written.trimEnd()}\n\n${add}` : add
}

/** The documents the AI may read (kinds of the case file other than the FIR text and the statements). */
export const DOCUMENT_KINDS = ['evidence', 'notice', 'expert', 'search', 'certificate', 'money', 'reply'] as const
/** The gateway refuses a prompt over 60,000 characters: the documents that do not fit are left out (and counted). */
export function fitSources(sources: Source[], max = 50000): { kept: Source[]; left: number } {
  let total = 0
  const kept: Source[] = []
  let left = 0
  for (const s of sources) {
    if (s.kind === 'document' && total + s.text.length > max) { left++; continue }
    total += s.text.length
    kept.push(s)
  }
  return { kept, left }
}

/** The decision logged in the gateway: all shown sentences kept, some, or none (an unreadable answer is rejected). */
export function decisionFor(read: DraftRead, kept: number): 'accepted' | 'edited' | 'rejected' {
  if (read.kind === 'unreadable' || kept === 0) return 'rejected'
  return kept < read.sentences.length ? 'edited' : 'accepted'
}
