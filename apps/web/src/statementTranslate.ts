// English translation of a statement (design board 6, AI feature A3, gateway feature statement_translate). Plain logic,
// no screen: the prompt sent to the gateway, and the check of its answer against the original. The answer is a draft
// the officer checks: the numbers of the original (in any Indian script's digits) that the draft does not carry are
// listed, so a changed amount, date or phone number is seen before saving. Change TRANSLATE_PROMPT_VERSION whenever the
// prompt text changes (the gateway logs it).
export const TRANSLATE_PROMPT_VERSION = 'statement_translate/en@1'
export const MAX_TRANSLATION = 40000

const NAMES: Record<string, string> = {
  hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', pa: 'Punjabi', gu: 'Gujarati', or: 'Odia', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam',
}

/** The text sent to the gateway. Written in English whatever the screen language. */
export function translatePrompt(text: string, language: string): string {
  const from = NAMES[language] ?? `the language with the code "${language}"`
  return [
    `Translate the witness statement below from ${from} into English.`,
    'Translate only: keep every name, number, date, time, amount and place exactly, and keep the order in which the person said things.',
    'Do not add, leave out, summarise or explain anything. Do not say whether the statement is true, whether the person is believable or whether anyone is guilty.',
    'Where a word cannot be translated, keep it as it is and put it in [square brackets].',
    'Answer with only the English text.',
    'Statement:',
    '<<<',
    text,
    '>>>',
  ].join('\n')
}

/** Digits of any Indian script (and ASCII) as ASCII: every Unicode decimal digit block of Indic scripts puts zero at 0x?66. */
export function asciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!
    if (cp < 0x80) return d
    const low = cp & 0x7f
    return low >= 0x66 && low <= 0x6f ? String(low - 0x66) : d
  })
}

/** The numbers of a text (runs of digits, with "40,000" and "40.000" read as one number), in ASCII digits. */
export function numbers(s: string): string[] {
  return (asciiDigits(s).match(/\d+(?:[,.]\d+)*/g) ?? []).map((n) => n.replace(/[,.]/g, ''))
}

export type Draft = { kind: 'draft'; text: string; missing: string[] } | { kind: 'empty' }

/** The model's answer as a draft: fences and a leading "Translation:" taken off, and the original's numbers it lacks. */
export function readTranslation(answer: string, original: string): Draft {
  const text = answer.trim().replace(/^```[a-z]*\s*\n?|\n?```$/g, '').replace(/^(english\s+)?translation\s*:\s*/i, '').trim()
  if (!text || text.length > MAX_TRANSLATION) return { kind: 'empty' }
  const have = new Set(numbers(text))
  return { kind: 'draft', text, missing: [...new Set(numbers(original))].filter((n) => !have.has(n)) }
}
