// "Documents disagree" (design board 2, AI feature A1, gateway feature fact_conflicts). Plain logic, no screen: the prompt
// sent to the gateway and the check of its answer. The FIR text is compared with the other documents of the case that hold
// facts (bank and telecom replies, the money trail typed from them, evidence descriptions, search memos, lab and hospital
// requests); statements are compared on the Statements part (A3). A conflict is shown only when it names a fact kind of the
// fact check, both quotes are words of two different sources, each value is in its own quote (digits for a number) and the
// two values differ. The AI never says which value is right: the officer confirms with the source (plan section 9, flaw 6).
// No names are sent: a source is "FIR", "D1", "D2"... with its title, which names people by label only (CaseFileController).
// Change CONFLICT_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { FACT_KINDS, jsonList, locate, type FactKind } from './factCheck'
import { judges } from './chargesheetDraft'

export const CONFLICT_PROMPT_VERSION = 'fact_conflicts/values@1'
export const MAX_PROMPT = 58000
const MAX_CONFLICTS = 20
/** The case-file passages (GET /firs/{id}/case-file) that hold facts to compare with the FIR. */
export const DOCUMENT_KINDS: ReadonlySet<string> = new Set(['reply', 'money', 'evidence', 'search', 'expert'])

export type Source = { id: string; title: string; text: string }
export type Side = { source: string; quote: string; value: string }
export type Conflict = { kind: FactKind; topic: string; a: Side; b: Side }
export type Read = { kind: 'conflicts'; conflicts: Conflict[]; dropped: number } | { kind: 'unreadable' }

const NUMBER: ReadonlySet<FactKind> = new Set(['amount', 'utr', 'phone', 'account'])
const digits = (s: string) => s.replace(/\D/g, '')
// letters and digits only, lower case: "21 Aug." and "21 aug" agree
const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
// an amount as a number: "Rs 9,80,000", "980000" and "Rs 980,000.00" (as the money trail writes it) agree
const amount = (s: string) => { const m = /\d[\d,]*(?:\.\d+)?/.exec(s); return m ? String(Number(m[0].replace(/,/g, ''))) : '' }
// what two values are compared by: an amount's number, the digits of another number, else letters and digits
const key = (kind: FactKind, s: string) => (kind === 'amount' ? amount(s) : NUMBER.has(kind) ? digits(s) : plain(s))
// whether the quote holds the value: digits for a number ("Rs 9,80,000" holds 980000), else letters and digits
const holds = (kind: FactKind, quote: string, value: string) => {
  const v = NUMBER.has(kind) ? digits(kind === 'amount' ? amount(value) : value) : plain(value)
  return v.length > 0 && (NUMBER.has(kind) ? digits(quote) : plain(quote)).includes(v)
}

/**
 * The FIR and the documents as sources FIR, D1, D2 ... (the FIR first; an empty text is left out). A document's text starts
 * with its title, which holds the date of a transfer, a hold or a reply (the money trail's text has no date of its own).
 */
export function sources(firText: string, passages: { kind: string; title: string; text: string | null }[]): Source[] {
  const docs = passages.filter((p) => DOCUMENT_KINDS.has(p.kind) && p.text && p.text.trim())
  return [...(firText.trim() ? [{ id: 'FIR', title: 'FIR text', text: firText }] : []), ...docs.map((p, i) => ({ id: `D${i + 1}`, title: p.title, text: `${p.title}: ${p.text!}` }))]
}

/** The text sent to the gateway. Written in English whatever the language of the texts. */
export function conflictPrompt(list: Source[]): string {
  return [
    'Below are the text of a police FIR and other documents of the same case (bank and telecom replies, money transfers, evidence and memos), each marked with an id (FIR, D1, D2 ...), possibly in different languages.',
    `List the facts on which two different sources give different values. A fact is one of these kinds: ${FACT_KINDS.join(', ')} (utr = bank transaction reference, upi = UPI id).`,
    'Answer with only a JSON list. Each entry is an object with: "kind" (one of the kinds), "topic" (which fact, a few words in English, e.g. "amount of the 21 August transfer"), "a" and "b". "a" and "b" are objects of two different sources: {"source": "<id>", "value": "<the value that source gives, short>", "quote": "<words of that source, copied exactly, character for character, at most 200 characters, holding the value>"}.',
    'Rules: report only two values that really differ for the same fact, never a fact one source leaves out. Never guess or complete a number. Do not say which value is right, and do not name or judge any person. If there is no such fact, answer [].',
    ...list.flatMap((s) => [`Source ${s.id}:`, '<<<', s.text, '>>>']),
  ].join('\n')
}

const side = (x: unknown, list: Source[], kind: FactKind): Side | null => {
  const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const id = typeof e.source === 'string' ? e.source.trim().toUpperCase() : ''
  const src = list.find((s) => s.id === id)
  const value = typeof e.value === 'string' ? e.value.trim() : ''
  const found = src && typeof e.quote === 'string' && e.quote.length <= 500 ? locate(src.text, e.quote) : null
  if (!src || !found || found.quote.length > 500 || !value || value.length > 200) return null
  return holds(kind, found.quote, value) ? { source: src.id, quote: found.quote, value } : null
}

/** The model's answer as conflicts grounded in two different sources with two different values; how many were left out. */
export function readConflicts(draft: string, list: Source[]): Read {
  const answer = jsonList(draft)
  if (!answer) return { kind: 'unreadable' }
  const conflicts: Conflict[] = []
  let dropped = 0
  for (const x of answer) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const kind = (typeof e.kind === 'string' ? e.kind.trim().toLowerCase() : '') as FactKind
    const topic = typeof e.topic === 'string' ? e.topic.trim() : ''
    const known = (FACT_KINDS as readonly string[]).includes(kind)
    const a = known ? side(e.a, list, kind) : null, b = known ? side(e.b, list, kind) : null
    // the topic is the AI's own words: one that says who lies or is right is dropped, as on the Statements part
    if (!topic || topic.length > 200 || judges(topic) || !a || !b || a.source === b.source || key(kind, a.value) === key(kind, b.value) || conflicts.length >= MAX_CONFLICTS) { dropped++; continue }
    conflicts.push({ kind, topic, a, b })
  }
  return { kind: 'conflicts', conflicts, dropped }
}
