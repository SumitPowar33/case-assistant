import { expect, test } from 'vitest'
import { auditCsv, courtTime, csvCell, gapName, type ExportAnswer } from './auditCsv'

// Fictional data only.
const row = (kind: string, at: string, what: string, reason: string | null = null, about: string | null = null) => ({ kind, at, who_name: 'SI Fictional Asha', who_rank: 'SI', what, reason, about })
const ai = (at: string, extra = {}) => ({ seq: 1, at, actor: 'u1', result: 'asked', feature: 'case_qa', label: 'Answer questions about the case file', provider: 'fake', model: 'fake-1', question_refused: null, ...extra })
const answer: ExportAnswer = { fir_ref: '2026/7', station_name: 'Fictional Cyber PS', exported_by_name: 'Insp Fictional SHO', exported_by_rank: 'Insp', reasons_withheld: false,
  rows: [row('protected_read', '2026-11-01T10:00:00Z', 'fir_text'), row('override', '2026-11-03T10:00:00Z', 'certificate:x', 'Fictional "quoted", reason', '7/E-01'), row('audit_export', '2026-11-26T10:00:00Z', 'case', 'Fictional court asked')] }

test('a cell is quoted, and one a spreadsheet would run as a formula is made plain text', () => {
  expect(csvCell('a "b", c\nd')).toBe('"a ""b"", c\nd"')
  for (const bad of ['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)', '  =1+1', '\t=1', '\r=1', '\tx']) expect(csvCell(bad).startsWith('"\'')).toBe(true)
  for (const fine of ['2026/7', 'दोषी', 'a=b', 'x - y', '']) expect(csvCell(fine)).toBe(`"${fine}"`)
})

test('times are India time with the day they fall on there', () => {
  expect(courtTime('2026-11-26T20:00:05Z')).toBe('2026-11-27 01:30:05 IST')
  expect(courtTime('2026-11-26T15:35:00+05:30')).toBe('2026-11-26 15:35:00 IST')
})

test('one file holds the head and the entries of both servers in time order', () => {
  const csv = auditCsv(answer, [ai('2026-11-02T10:00:00+00:00'), ai('2026-11-04T10:00:00+00:00', { actor: 'u9', result: 'refused', provider: null, model: null, question_refused: 'guilt' }),
    ai('2026-11-05T10:00:00+00:00', { result: 'asked', provider: null, model: 'fake-ocr', label: 'Read a scanned reply (OCR on this server)' })],
    [{ id: 'u1', full_name: 'SI Fictional Asha', rank: 'SI' }], '2026-11-26T10:00:01Z')
  expect(csv.charCodeAt(0)).toBe(0xfeff)
  const lines = csv.slice(1).split('\r\n')
  expect(lines.slice(0, 6)).toEqual(['"Audit entries of one case"', '"FIR","2026/7"', '"Police station","Fictional Cyber PS"', '"Exported by","Insp Fictional SHO (Insp)"',
    '"Exported on","2026-11-26 15:30:01 IST"', '"Entries","6"'])
  const head = lines.indexOf('"Time","Recorded by","Officer","Rank","Entry","Detail","Reason"')
  expect(lines.slice(head + 1, -1)).toEqual([
    '"2026-11-01 15:30:00 IST","Application","SI Fictional Asha","SI","Protected details read","FIR text",""',
    '"2026-11-02 15:30:00 IST","AI gateway","SI Fictional Asha","SI","AI: asked","Answer questions about the case file; model fake fake-1",""',
    '"2026-11-03 15:30:00 IST","Application","SI Fictional Asha","SI","Gap accepted","Electronic evidence without a complete BSA 63(4) certificate: 7/E-01 [certificate:x]","Fictional ""quoted"", reason"',
    '"2026-11-04 15:30:00 IST","AI gateway","Account u9","","AI: refused","Answer questions about the case file; question about guilt",""',
    '"2026-11-05 15:30:00 IST","AI gateway","SI Fictional Asha","SI","AI: asked","Read a scanned reply (OCR on this server); model fake-ocr",""',
    '"2026-11-26 15:30:00 IST","Application","SI Fictional Asha","SI","Case audit exported","","Fictional court asked"'])
  expect(csv).not.toContain('left out')
})

test('a file without the written reasons says so', () => {
  const csv = auditCsv({ ...answer, reasons_withheld: true, rows: [row('override', '2026-11-03T10:00:00Z', 'certificate:x')] }, [], [], '2026-11-26T10:00:01Z')
  expect(csv).toContain("written reasons are left out: this case protects the victim's identity")
  expect(csv).toContain('"Entries","1"')
})

test('AI entries of the same second are written in the order the gateway logged them', () => {
  // regression: the gateway answers newest first and keeps whole seconds, so a draft and its decision came out reversed
  const at = '2026-11-02T10:00:00+00:00'
  const csv = auditCsv({ ...answer, rows: [] }, [ai(at, { seq: 9, result: 'refused' }), ai(at, { seq: 8, result: 'accepted' }), ai(at, { seq: 7 })], [], at)
  expect([...csv.matchAll(/"AI: (\w+)"/g)].map((m) => m[1])).toEqual(['asked', 'accepted', 'refused'])
})

test('an accepted gap is named in words with what it was about; without that the stored key stays beside the name', () => {
  expect(gapName('en', 'second-link:p9', 'A2')).toBe('Account holder without a second link: A2')
  expect(gapName('en', 'pocso-step:support_person', 'support_person')).toBe('POCSO step not recorded: Support person for the child')
  expect(gapName('en', 'section-report:IT Act 66D', 'IT Act 66D')).toBe('Added section not yet reported to the Magistrate: IT Act 66D')
  expect(gapName('en', 'pocso-woman-officer', null)).toBe("Child's statement not recorded as taken by a woman officer")
  // the record is gone, or the playbook no longer holds the ingredient
  expect(gapName('en', 'certificate:gone', null)).toBe('Electronic evidence without a complete BSA 63(4) certificate (certificate:gone)')
  expect(gapName('en', 'ingredient:old/charge', null)).toBe('No evidence linked for an ingredient (ingredient:old/charge)')
  // a kind the screen does not know yet
  expect(gapName('en', 'later-kind:7', 'x')).toBe('later-kind:7')
  expect(gapName('mr', 'pocso-section', null)).not.toBe('pocso-section')
  const csv = auditCsv({ ...answer, rows: [row('override_withdrawn', '2026-11-03T10:00:00Z', 'ingredient:cheating/delivery', null, 'Fictional ingredient (BNS 318(4))'),
    row('override', '2026-11-04T10:00:00Z', 'later-kind:7')] }, [], [], '2026-11-26T10:00:01Z')
  expect(csv).toContain('"No evidence linked for an ingredient: Fictional ingredient (BNS 318(4)) [ingredient:cheating/delivery]"')
  expect(csv).toContain('"Gap accepted","later-kind:7",')
})
