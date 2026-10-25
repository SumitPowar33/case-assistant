import { expect, test } from 'vitest'
import { NOTICE_PROMPT_VERSION, noticePrompt } from './noticePrompt'

// Fictional data only.
const fir = { fir_no: 214, fir_year: 2026, sections: [{ act: 'BNS', section: '318(4)' }, { act: 'IT Act', section: '66D' }] }

test('a BNSS 94 prompt names the FIR, sections, addressee and every item, and leaves blanks for the officer', () => {
  const p = noticePrompt({ kind: 'BNSS_94', kindLabel: 'BNSS 94: produce documents or data', addressee: 'Nodal Officer, Fictional Bank',
    items: ['Account statement 01-09-2026 to 30-09-2026', 'KYC documents'], fir })
  expect(p).toContain('FIR No. 214/2026, registered under BNS 318(4), IT Act 66D')
  expect(p).toContain('Addressed to: Nodal Officer, Fictional Bank.')
  expect(p).toContain('- Account statement 01-09-2026 to 30-09-2026\n- KYC documents')
  expect(p).toContain('[REPLY DUE DATE]')
  expect(NOTICE_PROMPT_VERSION).toMatch(/^[\w./@-]+$/) // the gateway's rule for prompt versions
})

test('a notice to a person never sends their name to the AI', () => {
  const p = noticePrompt({ kind: 'BNSS_35_3', kindLabel: 'BNSS 35(3): appear before the officer', addressee: 'Fictional Person Name', items: [] })
  expect(p).not.toContain('Fictional Person Name')
  expect(p).toContain('[ADDRESSEE NAME AND ADDRESS]')
  expect(p).toContain('number to be filled in by the officer')
})
