// The audit log's pure parts (board 20): the station's list joined from the application's entries and the AI gateway's,
// and what is given to a court or an inquiry for one case, as CSV or on paper, written in English; times in India time.
import { translateCode } from './i18n'

export type CaseEntry = { kind: string; at: string; who_name: string; who_rank: string; what: string; reason: string | null; about: string | null }
export type AiEntry = { seq: number; at: string; actor: string; result: string; feature: string; label: string; provider: string | null; model: string | null; question_refused: string | null }
export type Person = { id: string; full_name: string; rank: string }
export type ExportAnswer = { fir_ref: string; station_name: string; exported_by_name: string; exported_by_rank: string; reasons_withheld: boolean; rows: CaseEntry[] }

/** A cell in quotes. A cell a spreadsheet would run as a formula (an officer's words starting "=" or "@") starts with an
 *  apostrophe, so opening the file runs nothing. */
export function csvCell(value: string): string {
  const safe = /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

/** "2026-11-26 21:05:09 IST": unambiguous in any spreadsheet, whatever the computer's clock zone is. */
export const courtTime = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 19).replace('T', ' ') + ' IST'

/** The gaps that are about one record or step; without what they were about, the stored key is shown beside their name. */
const ABOUT_ONE = ['ingredient', 'second-link', 'certificate', 'notice-certificate', 'section-report', 'pocso-step']

/** An accepted readiness gap in words: the kind of its stored key ("certificate:<id>") and what the server says it was
 *  about (a label, a day, a section, a POCSO step, an ingredient). A kind no catalog knows shows its key. */
export function gapName(lang: string, key: string, about: string | null): string {
  const kind = key.split(':')[0]
  const name = translateCode(lang, 'audit.gap', kind)
  if (name === kind) return key
  if (about) return `${name}: ${kind === 'pocso-step' ? translateCode(lang, 'pocsoStep', about) : about}`
  return ABOUT_ONE.includes(kind) ? `${name} (${key})` : name
}

// the file also keeps a gap's stored key, so an entry can be matched with the database
const appDetail = (r: CaseEntry) => r.kind === 'protected_read' ? translateCode('en', 'reads.what', r.what) : r.kind === 'audit_export' ? ''
  : r.kind.startsWith('override') ? withKey(gapName('en', r.what, r.about), r.what) : r.what

const withKey = (name: string, key: string) => name.includes(key) ? name : `${name} [${key}]`

const aiDetail = (e: AiEntry) => [e.label, e.model && `model ${e.provider ? `${e.provider} ` : ''}${e.model}`,
  e.question_refused && `question about ${e.question_refused}`].filter(Boolean).join('; ')

/** Two lists that are each newest first, joined newest first and cut to a page. Neither list's own order is changed, so
 *  how many were taken of each is where the next page of each begins. */
export function newestFirst<A extends { at: string }, B extends { at: string }>(first: A[], second: B[], size: number) {
  const rows: ({ app: A; ai?: undefined } | { app?: undefined; ai: B })[] = []
  let a = 0
  let b = 0
  while (rows.length < size && (a < first.length || b < second.length)) {
    if (a < first.length && (b >= second.length || Date.parse(first[a].at) >= Date.parse(second[b].at))) rows.push({ app: first[a++] })
    else rows.push({ ai: second[b++] })
  }
  return { rows, first: a, second: b }
}

/** One case's export, as the file and the court paper both give it: the particulars, the notes and the entries of the
 *  application and the AI gateway in time order. */
export function caseExport(answer: ExportAnswer, ai: AiEntry[], people: Person[], exportedAt: string) {
  const names = new Map(people.map((p) => [p.id, p]))
  const entries = [
    ...answer.rows.map((r) => ({ at: r.at, by: 'Application', officer: r.who_name, rank: r.who_rank, entry: translateCode('en', 'audit.kind', r.kind), detail: appDetail(r), reason: r.reason ?? '' })),
    // the gateway answers newest first and keeps whole seconds: its own numbering gives the order within one
    ...[...ai].sort((a, b) => a.seq - b.seq).map((e) => {
      const who = names.get(e.actor)
      return { at: e.at, by: 'AI gateway', officer: who?.full_name ?? `Account ${e.actor}`, rank: who?.rank ?? '', entry: `AI: ${e.result}`, detail: aiDetail(e), reason: '' }
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const particulars: [string, string][] = [
    ['FIR', answer.fir_ref],
    ['Police station', answer.station_name],
    ['Exported by', `${answer.exported_by_name} (${answer.exported_by_rank})`],
    ['Exported on', courtTime(exportedAt)],
    ['Entries', String(entries.length)],
  ]
  const notes = [
    ...(answer.reasons_withheld ? ["The officers' written reasons are left out: this case protects the victim's identity and the person exporting is not on its case team."] : []),
    'The AI gateway keeps no question or answer text, so none is here.',
  ]
  return { particulars, notes, entries }
}

export function auditCsv(answer: ExportAnswer, ai: AiEntry[], people: Person[], exportedAt: string): string {
  const { particulars, notes, entries } = caseExport(answer, ai, people, exportedAt)
  const lines = [
    ['Audit entries of one case'],
    ...particulars,
    ...notes.map((n) => ['Note', n]),
    [],
    ['Time', 'Recorded by', 'Officer', 'Rank', 'Entry', 'Detail', 'Reason'],
    ...entries.map((e) => [courtTime(e.at), e.by, e.officer, e.rank, e.entry, e.detail, e.reason]),
  ]
  // the byte order mark makes a spreadsheet read the file as UTF-8 (names and reasons in Indian scripts)
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
