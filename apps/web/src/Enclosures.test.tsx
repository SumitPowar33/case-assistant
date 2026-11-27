// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import Enclosures from './Enclosures'
import type { Enclosure } from './paperIndex'

// Fictional data only.
afterEach(cleanup)

const row = (o: Partial<Enclosure>): Enclosure => ({ kind: 'statement', ref: 'W1', detail: null, on_date: '2026-11-13', state: 'ok', note: null, ...o })

test('one line for each kind with its count; what is expected or not on file is named under it', () => {
  render(<Enclosures list={[
    row({ kind: 'fir', ref: '3/2026' }),
    row({}), row({ ref: 'W2' }),
    row({ kind: 'notice', ref: 'BNSS_94', detail: 'Fictional Bank', state: 'wait', note: 'no_reply' }),
    row({ kind: 'notice', ref: 'BNSS_94', detail: 'Fictional Wallet' }),
    row({ kind: 'certificate', ref: 'E2', state: 'missing', note: 'part_b' }),
    row({ kind: 'search_memo', ref: null, state: 'wait', note: 'recording_not_sent' }),
    row({ kind: 'expert_medical', ref: null, detail: 'Fictional Hospital', state: 'wait', note: 'report_awaited' }),
    row({ kind: 'medical_report', ref: null, state: 'missing', note: 'no_medical' }),
  ]} />)
  expect(screen.getByRole('heading', { name: 'Papers that go with the report (9)' })).toBeTruthy()
  const items = screen.getAllByRole('listitem')
  expect(items.map((i) => i.querySelector('strong')!.textContent)).toEqual(
    ['FIR', 'Witness statements', 'Notices and replies', 'BSA 63(4) certificates', 'Search and seizure memos', 'Medical reports', 'Medical examination report'])
  expect(items[1].textContent).toBe('Witness statements (2) On file')
  expect(within(items[2]).getByText(/Notice and replies, BNSS 94: produce documents or data: Fictional Bank/).textContent).toContain('Reply awaited')
  expect(within(items[2]).queryByText(/Fictional Wallet/)).toBeNull()
  expect(within(items[2]).queryByText('On file')).toBeNull()
  expect(within(items[3]).getByText('Part B missing').className).toBe('chip c-crit')
  expect(within(items[3]).getByText(/BSA 63\(4\) certificate of item E2/)).toBeTruthy()
  expect(within(items[4]).getByText(/^Search and seizure memo$|^Search and seizure memo /).textContent).toContain('Sending of the recording to the Magistrate not recorded')
  expect(within(items[4]).getByText('Sending of the recording to the Magistrate not recorded').className).toBe('chip c-warn')
  expect(within(items[5]).getByText(/Medical request and report: Fictional Hospital/)).toBeTruthy()
  expect(within(items[6]).getByText(/Medical examination report \(BNSS 193\(3\)\(i\)\(h\)\)/).textContent).toContain('Not on file')
})
