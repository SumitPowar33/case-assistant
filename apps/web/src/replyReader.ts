// AI reply reader for notices (design board 4, AI feature A4, gateway feature reply_check). Plain logic, no screen: the
// prompt sent to the gateway, and the check of its answer against the reply text. An item is shown as "came" only when
// the quote the AI gives is words of the reply; the BSA 63(4) Part B certificate is shown as present only the same way.
// Everything else is "not found". The officer ticks the boxes; this only suggests. Change REPLY_PROMPT_VERSION whenever
// the prompt text changes (the gateway logs it).
import { jsonList, locate } from './factCheck'

export const REPLY_PROMPT_VERSION = 'reply_check/reply@1'
export const MAX_REPLY = 30000
const CERTIFICATE = 'certificate'

export type ItemRead = { item: string; present: boolean; quote: string }
export type ReplyRead =
  | { kind: 'read'; items: ItemRead[]; certificate: { present: boolean; quote: string } | null }
  | { kind: 'unreadable' }

/** The text sent to the gateway. Written in English whatever the screen language. Never names or the complaint. */
export function replyPrompt(items: string[], reply: string, askCertificate: boolean): string {
  return [
    'A police notice asked a bank or telecom company for the items below. Read its reply and say, for each item, whether the reply brings it.',
    'Answer with only a JSON list. Each entry is an object with "item" (the item exactly as listed), "present" (true or false) and "quote" (the words of the reply that bring it, copied exactly, character for character, at most 300 characters; empty when not present).',
    askCertificate ? `Add one more entry with "item" set to "${CERTIFICATE}", for a certificate under section 63(4) of the Bharatiya Sakshya Adhiniyam (Part A and Part B) signed by the company's officer: "present" true only if the reply has such a certificate, with the words that show it as "quote".` : '',
    'Rules: say present only when the reply itself holds the item (not a promise to send it later). Never guess. Do not say whether anyone is guilty or whether the reply is true.',
    'Items asked for:',
    ...items.map((i) => `- ${i}`),
    'Reply:',
    '<<<',
    reply,
    '>>>',
  ].filter(Boolean).join('\n')
}

/** The answer checked against the reply: one row per item asked for, present only with a quote found in the reply. */
export function readReply(answer: string, items: string[], reply: string, askCertificate: boolean): ReplyRead {
  const list = jsonList(answer)
  if (!list) return { kind: 'unreadable' }
  const entries = list.map((x) => (x && typeof x === 'object' ? x : {}) as Record<string, unknown>)
  const found = (e: Record<string, unknown> | undefined) => {
    const q = e && e.present === true && typeof e.quote === 'string' && e.quote.length <= 500 ? locate(reply, e.quote) : null
    return q ? q.quote : null
  }
  const named = (name: string) => entries.find((e) => typeof e.item === 'string' && e.item.trim().toLowerCase() === name.trim().toLowerCase())
  const rows = items.map((item) => { const q = found(named(item)); return { item, present: q !== null, quote: q ?? '' } })
  const cq = askCertificate ? found(named(CERTIFICATE)) : null
  return { kind: 'read', items: rows, certificate: askCertificate ? { present: cq !== null, quote: cq ?? '' } : null }
}
