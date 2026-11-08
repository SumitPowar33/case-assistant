// AI fact check of the FIR text (design board 2, AI feature A1, gateway feature fir_extract). Plain logic, no screen: the
// prompt sent to the gateway, and the check of its answer against the text. A fact is shown only when its quote is words
// of the FIR text and, for a number, the quote holds the number; everything else is dropped and counted. People's names
// are not asked for. Change FACT_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
export const FACT_PROMPT_VERSION = 'fir_extract/facts@1'
export const FACT_KINDS = ['date', 'time', 'place', 'amount', 'utr', 'phone', 'account', 'upi'] as const
export type FactKind = (typeof FACT_KINDS)[number]
export type Fact = { kind: FactKind; value: string; quote: string; at: number }
export type Read = { kind: 'facts'; facts: Fact[]; dropped: number; missing: FactKind[] } | { kind: 'unreadable' }

// the kinds whose value is a number that must be in the quote (digits only, so "Rs 40,000" and "40000" agree)
const NUMBER: ReadonlySet<FactKind> = new Set(['amount', 'utr', 'phone', 'account'])
const MAX_FACTS = 40

/** The text sent to the gateway. Written in English whatever the screen or text language. */
export function factPrompt(text: string): string {
  return [
    'Read the FIR text below and list the facts in it of these kinds:',
    'date (of the offence or of an event), time, place, amount (money), utr (bank transaction reference), phone (a phone number), account (a bank account number), upi (a UPI id).',
    'Answer with only a JSON list. Each entry is an object with three strings: "kind" (one of the kinds above), "value" (the fact, short) and "quote" (the words of the FIR text it comes from, copied exactly, character for character, at most 200 characters).',
    'Rules: list only what the text says; never guess or complete a number. Do not list names of people. If the text has no fact of a kind, leave that kind out. If the text gives two different values for the same thing, list both.',
    'FIR text:',
    '<<<',
    text,
    '>>>',
  ].join('\n')
}

const digits = (s: string) => s.replace(/\D/g, '')

/** Where the quote stands in the text: exactly, or with any run of spaces and line breaks counted as one; -1 when it is not there. */
export function locate(text: string, quote: string): { at: number; quote: string } | null {
  const q = quote.trim()
  if (!q) return null
  const exact = text.indexOf(q)
  if (exact >= 0) return { at: exact, quote: q }
  const pattern = q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  const m = new RegExp(pattern).exec(text)
  return m ? { at: m.index, quote: m[0] } : null
}

/** The JSON list in a model's answer (it may wrap it in ``` fences or a sentence), or null. */
export function jsonList(draft: string): unknown[] | null {
  for (let i = draft.indexOf('['); i >= 0; i = draft.indexOf('[', i + 1)) {
    if (!/^\[\s*(\{|\])/.test(draft.slice(i))) continue
    for (let j = draft.lastIndexOf(']'); j > i; j = draft.lastIndexOf(']', j - 1)) {
      try {
        const v: unknown = JSON.parse(draft.slice(i, j + 1))
        if (Array.isArray(v)) return v
      } catch { /* try a shorter piece */ }
    }
  }
  return null
}

/** The answer checked against the FIR text: the facts that point at its words, how many did not, and the kinds not found. */
export function readFacts(draft: string, text: string): Read {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const facts: Fact[] = []
  const seen = new Set<string>()
  let dropped = 0
  for (const x of list) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const kind = typeof e.kind === 'string' ? e.kind.trim().toLowerCase() : ''
    const value = typeof e.value === 'string' ? e.value.trim() : ''
    const located = typeof e.quote === 'string' && e.quote.length <= 500 ? locate(text, e.quote) : null
    const found = located && located.quote.length <= 500 ? located : null
    const ok = (FACT_KINDS as readonly string[]).includes(kind) && value && value.length <= 200 && found
      && (!NUMBER.has(kind as FactKind) || (digits(value).length > 0 && digits(found.quote).includes(digits(value))))
    const key = `${kind}|${value.toLowerCase()}`
    if (!ok || seen.has(key) || facts.length >= MAX_FACTS) { dropped += ok ? 0 : 1; continue }
    seen.add(key)
    facts.push({ kind: kind as FactKind, value, quote: found.quote, at: found.at })
  }
  facts.sort((a, b) => a.at - b.at)
  return { kind: 'facts', facts, dropped, missing: FACT_KINDS.filter((k) => !facts.some((f) => f.kind === k)) }
}
