// AI briefing for the Supervisor review (design board 11, AI feature A9, gateway feature supervisor_brief, plan section 3).
// Plain logic, no screen: the facts of one case, the prompt sent to the gateway and the check of its answer.
// Only what the supervisor's table and the readiness check already state goes to the gateway, as numbered facts: the FIR
// number, its sections, the nearest deadline, the open gaps (an ingredient's playbook text; never an account holder's name
// or an evidence label), the state of the final report and whether an IO is assigned. No name, no text of the file, so
// nothing protected can reach the AI provider. Each sentence of the briefing must name the facts it rests on and may hold
// only their numbers; a sentence that judges a person, rates or blames an officer, or predicts the outcome is not shown.
// Change BRIEF_PROMPT_VERSION whenever the prompt text changes (the gateway logs it).
import en from './i18n/en.json'
import { judges } from './chargesheetDraft'
import { jsonList } from './factCheck'
import { LANGUAGE_NAMES, numbers } from './statementTranslate'

export const BRIEF_PROMPT_VERSION = 'supervisor_brief/case@1'
const MAX_GAPS = 12
const MAX_SENTENCES = 8
const MAX_SENTENCE = 400

export type CaseRow = {
  fir_no: number; fir_year: number; sections: string; io_name: string | null
  deadline_kind: string | null; due_on: string | null; days_left: number | null; report_status: string | null
}
export type Gap = { key: string; message: string; override?: unknown }
export type Fact = { id: string; text: string }

const REPORT: Record<string, string> = {
  draft: 'the final report is a draft with the investigating officer',
  returned: 'the final report was returned to the investigating officer for changes',
  submitted: 'the final report was submitted and waits for the supervisor\'s decision',
  approved: 'the final report is approved and waits to be signed by the investigating officer',
}

/** A deadline kind in English words, whatever the screen language; a notice reply never names the addressee. */
function deadlineName(kind: string): string {
  if (kind.startsWith('notice_reply:')) return 'Reply to a notice'
  return (en as Record<string, string>)[`deadline.${kind}`] ?? 'A deadline'
}

/** An open gap in words that carry no name: the playbook's ingredient text, or the kind of gap. */
function gapText(g: Gap): string {
  if (g.key.startsWith('ingredient:')) return `readiness gap: ${g.message}`
  if (g.key.startsWith('second-link:')) return 'readiness gap: an account holder has no independent second link yet'
  if (g.key.startsWith('certificate:')) return 'readiness gap: an electronic item has no complete BSA 63(4) certificate'
  return 'readiness gap of another kind'
}

/** The numbered facts of one case sent to the gateway, built only from the supervisor's table and the readiness check. */
export function briefFacts(r: CaseRow, gaps: Gap[], ioLeft: boolean): Fact[] {
  const lines = [`FIR ${r.fir_no}/${r.fir_year}, sections: ${r.sections || 'none recorded'}`]
  if (r.deadline_kind && r.due_on && r.days_left !== null) {
    const when = r.days_left < 0 ? `overdue by ${-r.days_left} days` : r.days_left === 0 ? 'due today' : `${r.days_left} days left`
    lines.push(`nearest deadline: ${deadlineName(r.deadline_kind)}, due on ${r.due_on} (${when})`)
  } else lines.push('no deadline is due')
  const open = gaps.filter((g) => g.override == null)
  if (open.length === 0) lines.push('the readiness check has no open gap')
  open.slice(0, MAX_GAPS).forEach((g) => lines.push(gapText(g)))
  if (open.length > MAX_GAPS) lines.push(`and ${open.length - MAX_GAPS} more open readiness gaps`)
  lines.push(r.report_status && REPORT[r.report_status] ? REPORT[r.report_status] : 'the final report is not started; the investigating officer writes it')
  lines.push(!r.io_name ? 'no investigating officer is assigned; the supervisor assigns one'
    : ioLeft ? 'the investigating officer has left the station; the supervisor assigns a new one' : 'an investigating officer is assigned')
  return lines.map((text, i) => ({ id: `F${i + 1}`, text }))
}

/** The text sent to the gateway. Written in English whatever the screen language; the briefing is in `language`. */
export function briefPrompt(facts: Fact[], language: string): string {
  const into = LANGUAGE_NAMES[language] ?? 'English'
  return [
    `Below are numbered facts about one open police case. Write a short briefing for the supervising officer in ${into}, in plain words:`,
    'at most 5 sentences saying what is due and when, what the readiness check still lacks, and who must act next.',
    'Answer with only a JSON list. Each entry is an object with "text" (one sentence) and "facts" (a list of the ids of the facts it rests on, such as ["F2"]).',
    'Rules: use only these facts and no other number or date. Do not name anyone.',
    'Never rate, praise or blame an officer, never say how well anyone works, never say or suggest that anyone is guilty, innocent, truthful or lying, and never predict how the case will end.',
    ...facts.map((f) => `${f.id}: ${f.text}`),
  ].join('\n')
}

// Words that rate, blame or discipline an officer, or predict the outcome. A sentence with one is not shown.
const RATES = /\b(negligen\w*|lazy|laziness|careless\w*|incompeten\w*|inefficien\w*|efficien\w*|diligen\w*|sloppy|slack\w*|lax|blam\w*|fault\w*|dereliction|disciplin\w*|reprimand\w*|suspen(d|sion)\w*|punish\w*|warn(ed|ing)? the|perform\w*|scor(e|es|ed|ing)|rating|rated|acquit\w*|likely to|chances?|probab\w*)\b|\b(good|bad|poor|weak|strong|excellent) (officer|work|job|case)\b|\bfail(ed|s|ing)? (in |to do )?(his|her|their) duty\b|लापरवाह|लापरवाही|निकम्मा|आलसी|सुस्त|दोष (है|दिया)|निलंबित|निलंबन|दंडित|फटकार|चूक (की|केली)|(अच्छा|बुरा|खराब|कमजोर|कमज़ोर|उत्कृष्ट|चांगला|वाईट|कमकुवत) (अधिकारी|काम|काम|तपास|केस)|रेटिंग|अंक दिए|निष्काळजी|निष्काळजीपणा|आळशी|हलगर्जी|शिक्षा होण|बरी होण|बरी होईल|बरखास्त|दोषमुक्त होगा|छूट जाएगा|सजा होगी|शिक्षा होईल|बरी होईल|संभावना|शक्यता/i

/** True when a sentence rates or blames an officer, or predicts the outcome of the case. */
export const rates = (sentence: string) => RATES.test(sentence)

export type Line = { text: string; facts: Fact[] }
export type Brief = { kind: 'brief'; lines: Line[]; dropped: number; opinions: number } | { kind: 'unreadable' }

/** The answer checked: sentences that name known facts and hold only their numbers; opinions and the rest are counted, not shown. */
export function readBrief(draft: string, facts: Fact[]): Brief {
  const list = jsonList(draft)
  if (!list) return { kind: 'unreadable' }
  const byId = new Map(facts.map((f) => [f.id, f]))
  const lines: Line[] = []
  let dropped = 0, opinions = 0
  for (const x of list) {
    const e = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const text = typeof e.text === 'string' ? e.text.trim().replace(/\s+/g, ' ') : ''
    const ids = Array.isArray(e.facts) ? e.facts : []
    const cited = ids.map((id) => (typeof id === 'string' ? byId.get(id.trim()) : undefined))
    if (!text || text.length > MAX_SENTENCE || cited.length === 0 || cited.some((f) => !f)) { dropped++; continue }
    const known = new Set(cited.flatMap((f) => numbers(f!.text)).map((n) => String(Number(n))))
    if (numbers(text.replace(/\bF\d+\b/g, '')).some((n) => !known.has(String(Number(n))))) { dropped++; continue }
    if (judges(text) || rates(text)) { opinions++; continue }
    if (lines.length >= MAX_SENTENCES || lines.some((l) => l.text.toLowerCase() === text.toLowerCase())) continue
    lines.push({ text, facts: [...new Set(cited as Fact[])] })
  }
  return { kind: 'brief', lines, dropped, opinions }
}
