// The meaning half of "Ask the case file" (item 17): the AI gateway's embedding model, which runs on the state's own server,
// makes a vector for the question and for each piece of the case file that has none yet; the core app keeps them (V58, by the
// hash of the piece's text), so only new or changed pieces are embedded again. Any failure (no model installed, the gateway
// down) gives null and the screen ranks by words alone.
import { ai, get, send } from './api'
import { candidates, type Passage, type Vectors } from './askFile'

type Embedded = { model: string; min_similarity: number; vectors: number[][] }
const BATCH = 64   // the most the gateway and the core take in one call

export async function loadVectors(firId: string, question: string, passages: Passage[]): Promise<Vectors | null> {
  const all = candidates(passages)
  if (!all.length) return null
  try {
    const q = await ai<Embedded>('/v1/embed', { method: 'POST', body: { case_ref: firId, texts: [question], kind: 'query' } })
    const stored = await get<{ items: { hash: string; vec: number[] }[] }>(`/firs/${firId}/case-file/vectors?model=${encodeURIComponent(q.model)}`)
    const byHash = new Map(stored.items.map((i) => [i.hash, i.vec]))
    const keep = [...new Set(all.map((c) => c.hash))]
    const missing = keep.filter((h) => !byHash.has(h)).map((h) => all.find((c) => c.hash === h)!)
    for (let from = 0; from < missing.length; from += BATCH) {
      const batch = missing.slice(from, from + BATCH)
      const e = await ai<Embedded>('/v1/embed', { method: 'POST', body: { case_ref: firId, texts: batch.map((c) => c.embedText), kind: 'passage' } })
      const items = batch.map((c, i) => ({ hash: c.hash, vec: e.vectors[i] }))
      await send(`/firs/${firId}/case-file/vectors`, 'PUT', { model: q.model, keep, items })
      items.forEach((i) => byHash.set(i.hash, i.vec))
    }
    // pieces that changed since the last question leave their old vectors behind: remove them
    if (!missing.length && [...byHash.keys()].some((h) => !keep.includes(h))) await send(`/firs/${firId}/case-file/vectors`, 'PUT', { model: q.model, keep, items: [] })
    return { query: q.vectors[0], byHash, minSimilarity: q.min_similarity }
  } catch {
    return null
  }
}
