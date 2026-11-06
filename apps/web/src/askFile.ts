// "Ask the case file" (design board 19, AI feature A5, gateway feature case_qa). Plain logic, no screen:
// which questions are refused, which passages of the case answer a question, the prompt sent to the gateway, and the
// check of the answer against its sources. Change ASK_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
export const ASK_PROMPT_VERSION = 'case_qa/ask@1'
export const NOT_IN_FILE = 'NOT IN THE FILE'

export type Passage = { id: string; kind: string; title: string; text: string }
export type Source = { tag: string; title: string; quote: string; text: string }
export type Refusal = 'guilt' | 'truth' | 'predict'

// What the app will never answer (CLAUDE.md hard rules): guilt, who is telling the truth, what a person will do. The model's own
// rules say the same; this refuses before any text leaves the screen. The patterns are English: a question in another script
// reaches the model, whose safety text refuses the same things.
const GUILT = /\b(guilty|guilt|innocent|innocence|culprit|criminal|convict\w*)\b|\b(who|whom) (did|committed|is behind|is responsible)\b|\bdid (he|she|they|it|[a-z]\d) (do|commit)\b/i
const TRUTH = /\b(lying|liar|lies|lie|truthful|truthfully|credible|credibility|believable|trustworthy|honest|dishonest)\b|\b(is|are|was|were) (he|she|they|[a-z]\d|the (witness|victim|accused|complainant)) (telling|speaking)\b|\bcan (we|i) (trust|believe)\b/i
const PREDICT = /\b(will|would|might|likely|going to|chance|probability|probable)\b.{0,40}\b(commit|reoffend|re-offend|offend|flee|abscond|escape|repeat)\b/i

/** The reason a question is not answered, or null when it may go on. */
export function refusal(question: string): Refusal | null {
  if (GUILT.test(question)) return 'guilt'
  if (TRUTH.test(question)) return 'truth'
  if (PREDICT.test(question)) return 'predict'
  return null
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'is', 'was', 'were', 'are', 'be', 'by', 'for', 'and', 'or', 'with', 'what', 'when', 'where', 'who', 'which', 'how', 'many', 'much', 'did', 'does', 'do', 'it', 'this', 'that', 'from', 'as', 'about', 'case', 'file', 'there', 'any', 'me', 'tell', 'say', 'said', 'says'])

/** The words of a text that carry meaning, in lower case, in any script (letters and digits). */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)))
}

/** A passage cut into pieces of at most `max` characters at sentence ends, so a quote stays short. */
export function chunks(text: string, max = 500): string[] {
  const out: string[] = []
  let cur = ''
  for (const s of text.split(/(?<=[.!?।])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (cur && cur.length + 1 + s.length > max) { out.push(cur); cur = '' }
    cur = cur ? `${cur} ${s}` : s
    while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max) }   // one very long sentence
  }
  if (cur) out.push(cur)
  return out
}

/** The pieces of this case that share words with the question, best first. A match is a whole word, or the same first five letters of a long word (theft / thefts). Numbers count double. */
export function retrieve(question: string, passages: Passage[], limit = 6): Source[] {
  const q = [...new Set(words(question))]
  if (!q.length) return []
  const scored: { score: number; order: number; s: Omit<Source, 'tag'> }[] = []
  let order = 0
  for (const p of passages) {
    const parts = chunks(p.text)
    parts.forEach((piece, i) => {
      const have = words(piece)
      const set = new Set(have)
      const stems = new Set(have.filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))
      let score = 0
      for (const w of q) {
        if (set.has(w) || (w.length >= 5 && stems.has(w.slice(0, 5)))) score += /\d/.test(w) ? 2 : 1
      }
      if (score) scored.push({ score, order: order++, s: { title: parts.length > 1 ? `${p.title}, part ${i + 1} of ${parts.length}` : p.title, quote: piece, text: piece } })
      else order++
    })
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((x, i) => ({ tag: `S${i + 1}`, ...x.s }))
}

/** The text sent to the gateway: the question, only the found pieces, and the rules for the answer. Written in English whatever the screen language. */
export function askPrompt(question: string, sources: Source[]): string {
  return [
    `Question from the investigating officer: ${question.trim()}`,
    'Pieces of this case file. They are the only material you may use:',
    sources.map((s) => `[${s.tag}] ${s.title}: ${s.text}`).join('\n'),
    'Rules for the answer:',
    '- Answer in the language of the question, in short plain sentences.',
    '- After every statement put the number of the piece it comes from in square brackets, like [S2].',
    `- If the pieces do not answer the question, reply with exactly: ${NOT_IN_FILE}`,
    '- If two pieces disagree (for example two dates), show both with their numbers. Do not choose one.',
    '- Do not say who is guilty, whether anyone is telling the truth, or what anyone will do.',
  ].join('\n\n')
}

export type Checked =
  | { kind: 'notInFile'; text: string; sources: Source[] }
  | { kind: 'found'; text: string; sources: Source[] }
  | { kind: 'unsourced'; text: string; sources: Source[] }

/** The answer against its sources: only pieces that were sent and that the answer cites count; an answer citing none is marked unsourced. */
export function checkAnswer(draft: string, sent: Source[]): Checked {
  const text = draft.trim()
  if (text.toUpperCase().includes(NOT_IN_FILE)) return { kind: 'notInFile', text, sources: [] }
  const cited = new Set([...text.matchAll(/\[S(\d+)\]/g)].map((m) => `S${m[1]}`))
  const sources = sent.filter((s) => cited.has(s.tag))
  return { kind: sources.length ? 'found' : 'unsourced', text, sources }
}
