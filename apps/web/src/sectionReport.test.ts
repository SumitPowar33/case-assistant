import { expect, test } from 'vitest'
import { courtDate, sectionReportDraft } from './sectionReport'

// Fictional data only.
const FIR = { fir_no: 214, fir_year: 2026, registered_at: '2026-08-18T05:30:00Z', sections: [{ act: 'BNS', section: '318(4)' }, { act: 'IT Act', section: '66D' }, { act: 'BNS', section: '319(2)' }] }
const A = { act: 'IT Act', section: '66D', added_at: '2026-08-19T19:00:00Z', reason: '  The caller used a phone to pose as the bank  ' }
const B = { act: 'BNS', section: '319(2)', added_at: '2026-08-21T06:00:00Z', reason: 'He said he was a bank officer' }

test('a court date is the day in India time', () => {
  expect(courtDate('2026-08-19T19:00:00Z')).toBe('20.08.2026')   // 00:30 IST on 20 August
  expect(courtDate('2026-08-19T18:29:59Z')).toBe('19.08.2026')
})

test('the draft names the FIR, its registration sections and each added section with its day and reason', () => {
  const d = sectionReportDraft(FIR, [A, B], ' Court of the Demo Magistrate ')
  expect(d).toContain('\nCourt of the Demo Magistrate\n')
  expect(d).toContain('Subject: Report of sections added in FIR No. 214/2026')
  expect(d).toContain('FIR No. 214/2026 was registered on 18.08.2026 under BNS 318(4). During the investigation the following sections have been added')
  expect(d).toContain('1. IT Act 66D (added on 20.08.2026): The caller used a phone to pose as the bank\n2. BNS 319(2) (added on 21.08.2026): He said he was a bank officer')
  expect(d.endsWith('Investigating Officer')).toBe(true)
})

test('one section, no court yet, and an FIR whose every section was added', () => {
  const d = sectionReportDraft({ ...FIR, sections: [{ act: 'IT Act', section: '66D' }] }, [A], '  ')
  expect(d).toContain('\n[court]\n')
  expect(d).toContain('Report of section added in FIR')
  expect(d).toContain('registered on 18.08.2026. During the investigation the following section has been added')
})

test('a section added later but not in this report is not named as a registration section', () => {
  const d = sectionReportDraft(FIR, [A], 'Court', [A, B])
  expect(d).toContain('registered on 18.08.2026 under BNS 318(4). During')
  expect(d).not.toContain('319(2)')
})
