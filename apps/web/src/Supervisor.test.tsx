// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import Supervisor from './Supervisor'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const row = (over: object) => ({
  id: 'f1', fir_no: 7, fir_year: 2026, sections: 'BNS 318(4)', io_name: 'SI Fictional Asha', io_rank: 'SI',
  deadline_kind: 'chargesheet_custody', due_on: '2026-11-11', days_left: 7, open_gaps: 0, report_status: null, can_decide: false, ...over,
})

function stub(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => body })))
}

test('lists the cases by deadline with the IO, open gaps and the state of the final report, linked to the report', async () => {
  stub(200, {
    waiting_approval: 1, due_in_21_days: 2,
    io_left: [],
    cases: [
      row({ open_gaps: 3, report_status: 'submitted', can_decide: true }),
      row({ id: 'f2', fir_no: 8, io_name: null, io_rank: null, deadline_kind: 'notice_reply:Fictional Bank', days_left: -2, open_gaps: 0, report_status: 'returned' }),
      row({ id: 'f3', fir_no: 9, deadline_kind: null, due_on: null, days_left: null, report_status: 'weird' }),
      row({ id: 'f4', fir_no: 10, days_left: 0 }),
    ],
  })
  render(<Supervisor />)
  const table = await screen.findByRole('table', { name: 'Open cases by nearest deadline' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(5)
  expect(rows[1].textContent).toContain('FIR 7/2026')
  expect(rows[1].textContent).toContain('SI Fictional Asha (SI)')
  expect(rows[1].textContent).toContain('7 days left')
  expect(rows[1].textContent).toContain('3')
  expect(rows[1].textContent).toContain('Submitted')
  expect(within(rows[1]).getByRole('link', { name: 'Open the report' }).getAttribute('href')).toBe('#/firs/f1/finalReport')
  expect(rows[2].textContent).toContain('No IO assigned')
  expect(rows[2].textContent).toContain('Reply to the notice from Fictional Bank')
  expect(rows[2].textContent).toContain('2 days overdue')
  expect(rows[2].textContent).toContain('Returned')
  expect(rows[3].textContent).toContain('No deadline')
  expect(rows[4].textContent).toContain('Due today')
  expect(rows[4].textContent).toContain('Not started')
  expect(screen.getByText('1 waiting for your decision')).toBeTruthy()
  expect(screen.getByText('2 due within 21 days')).toBeTruthy()
})

test('an empty queue says so', async () => {
  stub(200, { waiting_approval: 0, due_in_21_days: 0, cases: [], io_left: [] })
  render(<Supervisor />)
  expect(await screen.findByText('No open cases.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('the reason is shown when the server refuses', async () => {
  stub(403, { message: 'Only a supervisor can review the cases of a station.' })
  render(<Supervisor />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
})

test('the cases whose IO has left the station are listed with where the IO went and a link to assign a new one', async () => {
  stub(200, {
    waiting_approval: 0, due_in_21_days: 0, cases: [],
    io_left: [
      { id: 'f5', fir_no: 11, fir_year: 2026, io_name: 'SI Fictional Ravi', io_active: true, io_station_name: 'Fictional South PS' },
      { id: 'f6', fir_no: 12, fir_year: 2026, io_name: 'ASI Fictional Meena', io_active: false, io_station_name: 'Fictional North PS' },
      { id: 'f7', fir_no: 13, fir_year: 2026, io_name: 'SI Fictional Kiran', io_active: true, io_station_name: null },
    ],
  })
  render(<Supervisor />)
  const table = await screen.findByRole('table', { name: 'Cases whose IO has left the station' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(4)
  expect(rows[1].textContent).toContain('FIR 11/2026')
  expect(rows[1].textContent).toContain('SI Fictional Ravi')
  expect(rows[1].textContent).toContain('Now at Fictional South PS')
  expect(within(rows[1]).getByRole('link', { name: 'Assign a new IO' }).getAttribute('href')).toBe('#/firs/f5/case')
  expect(rows[2].textContent).toContain('Account closed')
  expect(rows[2].textContent).not.toContain('Fictional North PS')
  expect(rows[3].textContent).toContain('Now at —')
  expect(screen.getByText('No open cases.')).toBeTruthy()
})

test('no section for IOs who left when there are none', async () => {
  stub(200, { waiting_approval: 0, due_in_21_days: 0, cases: [], io_left: [] })
  render(<Supervisor />)
  await screen.findByText('No open cases.')
  expect(screen.queryByText('Cases whose IO has left the station')).toBeNull()
})
