// "Ask the case file" (design board 19, AI feature A5, gateway feature case_qa). Plain logic, no screen:
// which questions are refused, which passages of the case answer a question, the prompt sent to the gateway, and the
// check of the answer against its sources. Change ASK_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
export const ASK_PROMPT_VERSION = 'case_qa/ask@1'   // the prompt is unchanged; the pieces it carries are ranked by BM25 since session 92
export const NOT_IN_FILE = 'NOT IN THE FILE'

export type Passage = { id: string; kind: string; title: string; text: string }
export type Source = { tag: string; title: string; quote: string; text: string; passageId: string }
export type Refusal = 'guilt' | 'truth' | 'predict'

// What the app will never answer (CLAUDE.md hard rules): guilt, who is telling the truth, what a person will do. The model's own
// rules say the same; this refuses before any text leaves the screen. The patterns are English with a short draft list of Hindi
// and Marathi words (unreviewed); another question in an Indian script reaches the model, whose safety text refuses the same
// things. Kept the same as the gateway's REFUSED_QUESTIONS (tests/repo_rules/test_question_guard_same.py).
const GUILT = /\b(guilty|guilt|innocent|innocence|culprit|criminal|convict\w*|doshi|nirdosh|gunahgar)\b|\b(who|whom) (did|committed|is behind|is responsible)\b|\bdid (he|she|they|it|[a-z]\d) (do|commit)\b|\bdid (the )?\w+ (do it|do this|commit)\b|\b(is|are|was|were) (he|she|they|[a-z]\d|the (accused|suspect)) (really |actually )?responsible\b|दोषी|निर्दोष|गुन्हेगार|गुनहगार/i
const TRUTH = /\b(lying|liar|lies|lie|truthful|truthfully|credible|credibility|believable|trustworthy|honest|dishonest|reliable|unreliable|reliability|jhooth|jhoot|jhuth)\b|\b(is|are|was|were) (he|she|they|[a-z]\d|the (witness|victim|accused|complainant)) (telling|speaking)\b|\btelling the truth\b|\b(can|could|should) (we|i) (trust|believe|rely on)\b|\b(is|are|was|were) (the |his |her |this |that )?(\w+ ){0,2}(true|false|untrue|fabricated)\b|झूठ|खोटं|खोटे बोल|सच बोल|खरं बोल/i
const PREDICT = /\b(will|would|might|likely|going to|chance|probability|probable)\b.{0,40}\b(commit|reoffend|re-offend|offend|flee|abscond|escape|repeat|do it again|do this again|run away|tamper\w*|threaten\w*|harm)\b|\bflight risk\b|\b(is|are) (he|she|they|[a-z]\d|the (accused|suspect)) (\w+ )?dangerous\b/i

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

type Piece = { text: string; from: number; to: number }

/** A passage cut into pieces of at most `max` characters at sentence ends, each with the lines (from 1) it spans. */
export function pieces(text: string, max = 500): Piece[] {
  const out: Piece[] = []
  let cur: Piece | null = null
  text.split('\n').forEach((line, n) => {
    for (const s of line.split(/(?<=[.!?।])\s+/).map((x) => x.trim()).filter(Boolean)) {
      if (cur && cur.text.length + 1 + s.length > max) { out.push(cur); cur = null }
      cur = cur ? { text: `${cur.text} ${s}`, from: cur.from, to: n + 1 } : { text: s, from: n + 1, to: n + 1 }
      while (cur.text.length > max) { out.push({ ...cur, text: cur.text.slice(0, max) }); cur = { ...cur, text: cur.text.slice(max), from: cur.to } }   // one very long sentence
    }
  })
  if (cur) out.push(cur)
  return out
}

/** The pieces' texts only. */
export const chunks = (text: string, max = 500) => pieces(text, max).map((p) => p.text)

// BM25, the usual ranking of search engines: a word found in few pieces of this case counts more than one found in most,
// a word repeated in a piece counts less each time, and a long piece does not win just by being long.
const K1 = 1.2, B = 0.75

/** A short stable hash of a text (cyrb53, 14 hex digits): names a piece so its vector can be found again; not for security. */
export function pieceHash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** Every piece of every passage, named by its passage and lines, with the words it holds and the hash of the text that is embedded. */
export function candidates(passages: Passage[]) {
  return passages.flatMap((p) => {
    const parts = pieces(p.text)
    const lines = p.text.split('\n').length > 1
    return parts.map((piece, i) => {
      const title = lines ? `${p.title}, ${piece.from === piece.to ? `line ${piece.from}` : `lines ${piece.from}-${piece.to}`}`
        : parts.length > 1 ? `${p.title}, part ${i + 1} of ${parts.length}` : p.title
      const embedText = `${p.title}: ${piece.text}`.slice(0, 1900)   // the gateway takes at most 2000 characters
      return { title, text: piece.text, passageId: p.id, have: words(`${p.title} ${piece.text}`), embedText, hash: pieceHash(embedText) }   // the passage's name counts too ("the notice", "W1")
    })
  })
}

/** What the embedding model gave: the question's vector, the vector of each piece by its hash, and the lowest cosine that counts as a match for this model. */
export type Vectors = { query: number[]; byHash: Map<string, number[]>; minSimilarity: number }
const cosine = (a: number[], b: number[]) => a.length === b.length ? a.reduce((n, x, i) => n + x * b[i], 0) : 0   // unit vectors
const RRF = 60   // reciprocal rank fusion: a piece's score is the sum of 1 / (60 + its place) in each list it is in

/**
 * The pieces of this case that answer the question, best first. Two lists are made and fused (hybrid): BM25 over the words, and,
 * when the embedding model gave vectors, the pieces whose meaning is close to the question's (cosine above the model's own
 * minimum), so a question in Hindi or Marathi, or with other words than the file, still finds its piece. Without vectors it is
 * BM25 alone. BM25: a word found in few pieces of this case counts more than one found in most, a word repeated in a piece counts
 * less each time, and a long piece does not win by length. A match is a whole word, a longer word that starts with a question word of 4+
 * letters (call / caller), or the same first five letters of a long word (theft / thefts). Numbers count double. Each piece
 * is named by its passage and, for a passage of several lines, the lines it spans.
 */
export function retrieve(question: string, passages: Passage[], limit = 6, vectors?: Vectors): Source[] {
  const q = [...new Set(words(question))]
  const all = candidates(passages)
  if (!all.length) return []
  // the same word, a longer word starting with a word of 4+ letters (call / caller), or the same first five letters (theft / thefts)
  const tf = (w: string, have: string[]) => have.filter((h) => h === w || (w.length >= 4 && !/\d/.test(w) && h.startsWith(w))
    || (w.length >= 5 && h.length >= 5 && h.slice(0, 5) === w.slice(0, 5))).length
  const counts = all.map((c) => q.map((w) => tf(w, c.have)))
  const df = q.map((_, j) => counts.filter((c) => c[j] > 0).length)
  const avg = all.reduce((n, c) => n + c.have.length, 0) / all.length || 1
  const bm25 = all.map((c, i) => ({
    i, score: q.reduce((sum, w, j) => {
      const f = counts[i][j]
      if (!f) return sum
      const idf = Math.log(1 + (all.length - df[j] + 0.5) / (df[j] + 0.5))
      return sum + (/\d/.test(w) ? 2 : 1) * idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * c.have.length / avg))
    }, 0),
  })).filter((x) => x.score > 0)
  bm25.sort((a, b) => b.score - a.score || a.i - b.i)
  const meaning = vectors ? all.map((c, i) => ({ i, sim: vectors.byHash.has(c.hash) ? cosine(vectors.query, vectors.byHash.get(c.hash)!) : 0 }))
    .filter((x) => x.sim >= vectors.minSimilarity && x.sim > 0).sort((a, b) => b.sim - a.sim || a.i - b.i) : []
  const fused = new Map<number, number>()
  bm25.forEach((x, rank) => fused.set(x.i, 1 / (RRF + rank + 1)))
  meaning.forEach((x, rank) => fused.set(x.i, (fused.get(x.i) ?? 0) + 1 / (RRF + rank + 1)))
  const order = new Map(bm25.map((x, rank) => [x.i, rank]))   // a tie goes to the better word match, then to the earlier piece
  const best = [...fused].sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? Infinity) - (order.get(b[0]) ?? Infinity) || a[0] - b[0])
  return best.slice(0, limit).map(([i], n) => ({ tag: `S${n + 1}`, title: all[i].title, quote: all[i].text, text: all[i].text, passageId: all[i].passageId }))
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
