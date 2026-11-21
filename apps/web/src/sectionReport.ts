import { istToday } from './formats'

export type Added = { act: string; section: string; added_at: string; reason: string }
export type FirRef = { fir_no: number; fir_year: number; registered_at: string; sections: { act: string; section: string }[] }

/** A day in India time as a court paper writes it: 21.11.2026. */
export const courtDate = (iso: string) => istToday(Date.parse(iso)).split('-').reverse().join('.')

/**
 * The draft of the report to the Magistrate on sections added during the investigation (A2, V64): built from the case
 * alone (FIR number and date, the sections given at registration, each added section with its day and the reason the
 * officer gave), never from the AI and never with a person's name. English, as the court papers of item 18; the officer
 * edits it before it is sent and the text as sent is what is kept. `later` is every section added after registration.
 */
export function sectionReportDraft(fir: FirRef, added: Added[], court: string, later: { act: string; section: string }[] = added): string {
  // the sections given at registration: those of the FIR not added later (reported, waiting or chosen now)
  const atRegistration = fir.sections.filter((s) => ![...later, ...added].some((a) => a.act === s.act && a.section === s.section))
  const no = `${fir.fir_no}/${fir.fir_year}`
  const lines = added.map((a, i) => `${i + 1}. ${a.act} ${a.section} (added on ${courtDate(a.added_at)}): ${a.reason.trim()}`)
  return [
    'To,',
    'The Learned Magistrate,',
    court.trim() || '[court]',
    '',
    `Subject: Report of section${added.length === 1 ? '' : 's'} added in FIR No. ${no}`,
    '',
    'Respected Sir/Madam,',
    '',
    `FIR No. ${no} was registered on ${courtDate(fir.registered_at)}` +
      (atRegistration.length ? ` under ${atRegistration.map((s) => `${s.act} ${s.section}`).join(', ')}.` : '.') +
      ` During the investigation the following section${added.length === 1 ? ' has' : 's have'} been added, for the reasons given:`,
    '',
    ...lines,
    '',
    'This report is submitted for information and to be taken on record.',
    '',
    'Investigating Officer',
  ].join('\n')
}
