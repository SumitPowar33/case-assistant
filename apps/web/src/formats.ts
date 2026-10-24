// Plain helpers for the record forms (kept apart so Forms.tsx exports only components).

/** Acts the core app accepts in fir_section (V1 schema). */
export const ACTS = ['BNS', 'IPC', 'IT Act', 'NDPS Act', 'POCSO Act', 'Arms Act', 'SC/ST Act', 'Other'] as const

/**
 * "BNS 318(4), IT Act 66D" -> [{act:'BNS',section:'318(4)'}, {act:'IT Act',section:'66D'}].
 * Separated by commas or semicolons; the act must be one of ACTS (any letter case). Throws with the bad part.
 */
export function parseSections(text: string): { act: string; section: string }[] {
  return text.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((part) => {
    const act = [...ACTS].sort((a, b) => b.length - a.length).find((a) => part.toLowerCase().startsWith(a.toLowerCase() + ' '))
    const section = act ? part.slice(act.length).trim().replace(/^(section|sec\.?|s\.)\s*/i, '') : ''
    if (!act || !/^[0-9][0-9A-Za-z()/.-]*$/.test(section)) throw new Error(`Not understood: "${part}". Write it like "BNS 318(4)" or "IT Act 66D".`)
    return { act, section }
  })
}

/** A date and time typed in the browser's date-time field, read as India time. */
export function istIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Give the date and time.')
  return `${local}:00+05:30`
}

/** Dates and times are shown in India time whatever the computer's clock zone is. */
export const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST'
