import { expect, test } from 'vitest'
import { cdrPrompt, cdrRows, readSummary, type CdrFile } from './cdrSummary'

// Fictional numbers only.
const file: CdrFile = { id: 'c1', evidence: 'E1', target: '9000011111', target_person: 'A1', filename: 'f.csv', lines: 4, skipped: 0,
  loaded_at: '2026-09-10T10:00:00Z', loaded_by: 'SI Fictional', first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-04T04:30:00Z',
  contacts: [{ other: '9000022222', calls: 2, sms: 0, seconds: 195, first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-03T18:10:00Z', person: 'A2' }],
  cells: [{ cell: '404-10-1234-5678', events: 2, first_at: '2026-09-03T15:40:00Z', last_at: '2026-09-03T18:10:00Z' }],
  days: [{ day: '2026-09-03', events: 2 }] }

test('the tables become numbered rows with labels, never names, and the prompt carries only them and the rules', () => {
  const rows = cdrRows([file], [{ number: '9000077777', targets: ['9000011111', '9000022222'], events: 3, person: null }])
  expect(rows.map((r) => r.tag)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5'])
  expect(rows[1].text).toBe('E1, records of 9000011111 (A1): 9000022222 (A2): 2 calls (195 s), 0 SMS, first 2026-09-03T15:40:00Z, last 2026-09-03T18:10:00Z')
  expect(rows[4].text).toBe('9000077777 appears in the records of 9000011111 and 9000022222: 3 events')
  const p = cdrPrompt(rows, 'mr')
  expect(p).toContain('[T2] E1, records of')
  expect(p).toContain('language with code "mr"')
  expect(p).toContain('Do not say anyone is guilty')
})

test('only sentences naming rows that were sent are kept, and one that judges is dropped', () => {
  const rows = cdrRows([file], [])
  const s = readSummary('A1 and A2 spoke twice on 3 September [T2][T4]. They used one cell [T3][T99]. A2 is clearly the culprit [T2]. Nothing to see.', rows)
  expect(s.sentences.map((x) => x.text)).toEqual(['A1 and A2 spoke twice on 3 September.', 'They used one cell.'])
  expect(s.sentences[0].rows.map((r) => r.tag)).toEqual(['T2', 'T4'])
  expect(s.sentences[1].rows.map((r) => r.tag)).toEqual(['T3'])
  expect(s.dropped).toBe(2)
})
