// The file given to a court or an inquiry for one case (board 20): the application's audit entries and the AI gateway's,
// in time order, as CSV. Written in English; times in India time.
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

export function auditCsv(answer: ExportAnswer, ai: AiEntry[], people: Person[], exportedAt: string): string {
  const names = new Map(people.map((p) => [p.id, p]))
  const rows = [
    ...answer.rows.map((r) => ({ at: r.at, cells: ['Application', r.who_name, r.who_rank, translateCode('en', 'audit.kind', r.kind), appDetail(r), r.reason ?? ''] })),
    // the gateway answers newest first and keeps whole seconds: its own numbering gives the order within one
    ...[...ai].sort((a, b) => a.seq - b.seq).map((e) => {
      const who = names.get(e.actor)
      return { at: e.at, cells: ['AI gateway', who?.full_name ?? `Account ${e.actor}`, who?.rank ?? '', `AI: ${e.result}`, aiDetail(e), ''] }
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const lines = [
    ['Audit entries of one case'],
    ['FIR', answer.fir_ref],
    ['Police station', answer.station_name],
    ['Exported by', `${answer.exported_by_name} (${answer.exported_by_rank})`],
    ['Exported on', courtTime(exportedAt)],
    ['Entries', String(rows.length)],
    ...(answer.reasons_withheld ? [['Note', "The officers' written reasons are left out: this case protects the victim's identity and the person exporting is not on its case team."]] : []),
    ['Note', 'The AI gateway keeps no question or answer text, so none is here.'],
    [],
    ['Time', 'Recorded by', 'Officer', 'Rank', 'Entry', 'Detail', 'Reason'],
    ...rows.map((r) => [courtTime(r.at), ...r.cells]),
  ]
  // the byte order mark makes a spreadsheet read the file as UTF-8 (names and reasons in Indian scripts)
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
