// AI section suggestion (AI feature A2, gateway feature section_suggest). Plain logic, no screen: the prompt sent to the
// gateway, and the check of its answer. The AI is given the FIR text and the charges of the playbooks with their legal
// ingredients, and says which ingredients the text may describe, quoting the words. A charge is suggested only when at
// least one of its ingredients points at words of the FIR text; an unknown charge or ingredient, or a quote that is not
// in the text, is dropped and counted. The ingredient texts shown are the playbook's, never the AI's. Whether an
// ingredient is proved, and who did it, is never asked. Change SECTION_PROMPT_VERSION whenever the prompt text changes.
import { jsonList, locate } from './factCheck'

export const SECTION_PROMPT_VERSION = 'section_suggest/playbook@1'
export type Charge = { playbook_id: string; charge_id: string; act: string; law: string; label: string; ingredients: { id: string; text: string }[]; in_fir: boolean }
export type Met = { id: string; quote: string; at: number }
export type Suggestion = { charge: Charge; met: Met[] }
export type SuggestRead = { kind: 'suggestions'; suggestions: Suggestion[]; dropped: number } | { kind: 'unreadable' }

const key = (c: Charge) => `${c.playbook_id}/${c.charge_id}`

/** The text sent to the gateway. Written in English whatever the screen or text language. */
export function sectionPrompt(text: string, charges: Charge[]): string {
  return [
    'Below are charges, each with its legal ingredients, and an FIR text.',
    'For each charge, say which of its ingredients the FIR text describes, if any. This is only about what the text says: do not decide whether anything is proved, whether anyone is guilty, or whether anyone is telling the truth.',
    'Answer with only a JSON list. Each entry is an object: "charge" (the charge id as given), "ingredients" (a list of objects with "id", the ingredient id as given, and "quote", the words of the FIR text that describe it, copied exactly, character for character, at most 200 characters).',
    'Rules: leave out a charge when the text describes none of its ingredients; leave out an ingredient the text does not describe; never guess. Do not name people.',
    'Charges:',
    ...charges.map((c) => `${key(c)}: ${c.law}, ${c.label}. Ingredients: ${c.ingredients.map((i) => `${i.id}: ${i.text}`).join('; ')}`),
    'FIR text:',
    '<<<',
    text,
    '>>>',
  ].join('\n')
}

/** The answer checked against the charges and the FIR text, in the playbooks' order, with how many entries did not hold. */
export function readSuggestions(draft: string, text: string, charges: Charge[]): SuggestRead {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const found = new Map<string, Met[]>()
  let dropped = 0
  for (const x of list) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const charge = charges.find((c) => key(c) === e.charge)
    if (!charge || found.has(key(charge)) || !Array.isArray(e.ingredients)) { dropped++; continue }
    const met: Met[] = []
    for (const y of e.ingredients) {
      const i = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
      const loc = typeof i.quote === 'string' && i.quote.length <= 500 ? locate(text, i.quote) : null
      if (!loc || !charge.ingredients.some((g) => g.id === i.id) || met.some((m) => m.id === i.id)) { dropped++; continue }
      met.push({ id: i.id as string, quote: loc.quote, at: loc.at })
    }
    if (met.length) found.set(key(charge), met)
  }
  const suggestions = charges.filter((c) => found.has(key(c))).map((charge) => ({ charge, met: found.get(key(charge))! }))
  return { kind: 'suggestions', suggestions, dropped }
}
