// "Differences to clarify" between statements and the FIR (design board 6, AI feature A3, gateway feature statement_compare).
// Plain logic, no screen: the prompt sent to the gateway and the check of its answer. A difference is shown only when both
// quotes are words of the two different sources they name; everything else is dropped and counted. The AI never says which
// source is right, whether anyone lies or is believable: it points at two places the officer may ask about. Names are not
// sent: a source is "FIR", "S1", "S2"... Change COMPARE_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { jsonList, locate } from './factCheck'
import { judges } from './chargesheetDraft'

export const COMPARE_PROMPT_VERSION = 'statement_compare/diff@1'
export const MAX_PROMPT = 58000
const MAX_DIFFS = 20

export type Source = { id: string; text: string }
export type Side = { source: string; quote: string }
export type Difference = { topic: string; a: Side; b: Side }
export type Read = { kind: 'differences'; differences: Difference[]; dropped: number } | { kind: 'unreadable' }

/** The text sent to the gateway. Written in English whatever the language of the texts. */
export function comparePrompt(sources: Source[]): string {
  return [
    'Below are the text of a police FIR and statements of witnesses, each marked with an id (FIR, S1, S2 ...), possibly in different languages.',
    'List the places where two different sources say different things about the same fact (a date, time, place, amount, number, person, order of events, who did what).',
    'Answer with only a JSON list. Each entry is an object with: "topic" (the fact, a few words in English), "a" and "b". "a" and "b" are objects of two different sources: {"source": "<id>", "quote": "<words of that source, copied exactly, character for character, at most 200 characters>"}.',
    'Rules: report only a real difference between what two sources say, never something one source leaves out. Do not say which source is right, whether anyone is lying or believable, or whether anyone is guilty. If there is no difference, answer [].',
    ...sources.flatMap((s) => [`Source ${s.id}:`, '<<<', s.text, '>>>']),
  ].join('\n')
}

const side = (x: unknown, sources: Source[]): Side | null => {
  const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const id = typeof e.source === 'string' ? e.source.trim().toUpperCase() : ''
  const src = sources.find((s) => s.id === id)
  const found = src && typeof e.quote === 'string' && e.quote.length <= 500 ? locate(src.text, e.quote) : null
  return src && found && found.quote.length <= 500 ? { source: src.id, quote: found.quote } : null
}

/** The model's answer as differences whose both quotes are in two different sources; how many suggestions were left out. */
export function readDifferences(draft: string, sources: Source[]): Read {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const differences: Difference[] = []
  let dropped = 0
  for (const x of list) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const topic = typeof e.topic === 'string' ? e.topic.trim() : ''
    const a = side(e.a, sources), b = side(e.b, sources)
    // the topic is the AI's own words: one that says who lies or is right is dropped (weekly review 21 Nov)
    if (!topic || topic.length > 200 || judges(topic) || !a || !b || a.source === b.source || differences.length >= MAX_DIFFS) { dropped++; continue }
    differences.push({ topic, a, b })
  }
  return { kind: 'differences', differences, dropped }
}
