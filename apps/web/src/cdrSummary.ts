// The AI summary of call records (gateway feature cdr_summary). Plain logic, no screen: the analysis tables become numbered
// rows [T1]…; only those rows go to the gateway (numbers, counts, dates, cells and labels like A1, never a name); a sentence of
// the answer is kept only when it names rows that were sent and does not judge anyone (chargesheetDraft.judges).
// Change CDR_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import { judges } from './chargesheetDraft'

export const CDR_PROMPT_VERSION = 'cdr_summary/tables@1'
export type Contact = { other: string; calls: number; sms: number; seconds: number; first_at: string; last_at: string; person: string | null }
export type Cell = { cell: string; events: number; first_at: string; last_at: string }
export type CdrFile = { id: string; evidence: string; target: string; target_person: string | null; filename: string; lines: number; skipped: number
  loaded_at: string; loaded_by: string; first_at: string; last_at: string; contacts: Contact[]; cells: Cell[]; days: { day: string; events: number }[] }
export type Common = { number: string; targets: string[]; events: number; person: string | null }
export type Row = { tag: string; text: string }

const who = (n: string, person: string | null) => (person ? `${n} (${person})` : n)

/** The rows the summary may use, each with its tag. */
export function cdrRows(files: CdrFile[], common: Common[]): Row[] {
  const lines: string[] = []
  for (const f of files) {
    const of = `${f.evidence}, records of ${who(f.target, f.target_person)}`
    lines.push(`${of}: ${f.lines} records from ${f.first_at} to ${f.last_at}`)
    for (const c of f.contacts) lines.push(`${of}: ${who(c.other, c.person)}: ${c.calls} calls (${c.seconds} s), ${c.sms} SMS, first ${c.first_at}, last ${c.last_at}`)
    for (const c of f.cells) lines.push(`${of}: cell ${c.cell}: ${c.events} events, first ${c.first_at}, last ${c.last_at}`)
    for (const d of f.days) lines.push(`${of}: ${d.day}: ${d.events} events`)
  }
  for (const c of common) lines.push(`${who(c.number, c.person)} appears in the records of ${c.targets.join(' and ')}: ${c.events} events`)
  return lines.map((text, i) => ({ tag: `T${i + 1}`, text }))
}

export function cdrPrompt(rows: Row[], language: string): string {
  return [
    'Rows of call detail record tables of one police case. They are the only material you may use:',
    rows.map((r) => `[${r.tag}] ${r.text}`).join('\n'),
    'Rules for the summary:',
    `- Write at most 8 short sentences in the language with code "${language}".`,
    '- After every sentence put the numbers of the rows it comes from in square brackets, like [T2][T5].',
    '- Say what the counts, dates and cells show: who was in contact, how often, when, and which numbers several records share.',
    '- Do not guess what was said, who used a phone, where a person was, or any relationship. Do not say anyone is guilty, lying or suspicious.',
  ].join('\n\n')
}

export type Summary = { sentences: { text: string; rows: Row[] }[]; dropped: number }

/** The answer cut into sentences; one that names no sent row, or that judges someone, is dropped and counted. */
export function readSummary(draft: string, rows: Row[]): Summary {
  const byTag = new Map(rows.map((r) => [r.tag, r]))
  const sentences: Summary['sentences'] = []
  let dropped = 0
  for (const s of draft.split(/(?<=[.!?।])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
    const cited = [...new Set([...s.matchAll(/\[T(\d+)\]/g)].map((m) => `T${m[1]}`))].flatMap((t) => byTag.get(t) ?? [])
    if (!cited.length || judges(s)) { dropped++; continue }
    sentences.push({ text: s.replace(/\s*(\[T\d+\])+/g, '').trim(), rows: cited })
  }
  return { sentences, dropped }
}
