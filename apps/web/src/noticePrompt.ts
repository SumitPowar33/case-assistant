// The prompt for an AI draft of a notice. Change NOTICE_PROMPT_VERSION whenever the text below changes:
// the AI gateway logs it with every request, so the audit shows which template a draft came from.
export const NOTICE_PROMPT_VERSION = 'notice_draft/notice@1'

export type NoticeFacts = {
  kind: string; kindLabel: string; addressee: string; items: string[]
  fir?: { fir_no: number; fir_year: number; sections: { act: string; section: string }[] }
}

/**
 * Only what the notice itself must say: the provision, the FIR number and sections, the addressee and the items.
 * Never the complaint text or anyone's name or details from the case (victims stay protected; the AI gets no more
 * than it needs). Dates, signature and station are left as blanks for the officer. A BNSS 94 notice usually goes
 * to an institution (a bank, a telecom company), so its addressee is included; other notices go to a person (an
 * accused or a witness), so their name stays out and the officer fills it in.
 */
export function noticePrompt(f: NoticeFacts): string {
  const fir = f.fir
    ? `FIR No. ${f.fir.fir_no}/${f.fir.fir_year}${f.fir.sections.length ? `, registered under ${f.fir.sections.map((s) => `${s.act} ${s.section}`).join(', ')}` : ''}`
    : 'the FIR (number to be filled in by the officer)'
  return [
    `Write the text of a police notice: ${f.kindLabel}.`,
    `It is issued in ${fir}.`,
    f.kind === 'BNSS_94' ? `Addressed to: ${f.addressee}.` : 'Addressed to: [ADDRESSEE NAME AND ADDRESS] (leave this blank as written).',
    f.items.length ? `Items to be produced, listed exactly as given, one per line:\n${f.items.map((i) => `- ${i}`).join('\n')}` : 'No list of items.',
    'Write formal, short English. Name the legal provision. Leave these blanks for the officer exactly as written: '
      + '[REPLY DUE DATE], [OFFICER NAME AND RANK], [POLICE STATION], [DATE].',
    'Do not add any fact about the complaint, the offence or any person beyond what is written above.',
  ].join('\n\n')
}
