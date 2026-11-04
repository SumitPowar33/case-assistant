// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import MoneyTrail from './MoneyTrail'
import { rupees } from './formats'
import { setSession } from './api'

// Fictional data only.
beforeEach(() => setSession({ token: 't', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1' } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

const data = {
  evidence: [{ id: 'e1', label: '214/E-01' }],
  transfers: [
    { id: 't1', from_account: 'Fictional Victim A/c XXXX0055', to_account: 'Fictional A/c XXXX4471', amount_paise: 22400050, transferred_on: '2026-08-19', evidence_label: '214/E-01', to_person: 'A2' },
    { id: 't2', from_account: 'Fictional A/c XXXX4471', to_account: 'Fictional A/c XXXX1188', amount_paise: 1000000, transferred_on: '2026-08-20', evidence_label: null, to_person: null },
  ],
  holds: [{ id: 'h1', account: 'Fictional A/c XXXX4471', amount_paise: 620000, held_on: '2026-09-03', evidence_label: null }],
  accused: [
    { person_id: 'a1', label: 'A1', name: 'Fictional Caller', received_paise: 0, account_holder: false, second_links: 0, status: 'none' },
    { person_id: 'a2', label: 'A2', name: 'Fictional Holder', received_paise: 22400050, account_holder: true, second_links: 1, status: 'both' },
    { person_id: 'a3', label: 'A3', name: 'Fictional Receiver', received_paise: 0, account_holder: true, second_links: 0, status: 'money_only' },
    { person_id: 'a4', label: 'A4', name: 'Fictional Seller', received_paise: 0, account_holder: false, second_links: 2, status: 'second_only' },
  ],
  transferred_paise: 23400050, held_paise: 620000,
}

function stub(write: { status: number; body: unknown } = { status: 201, body: {} }, load: unknown = data) {
  const calls: { url: string; method: string; body?: Record<string, unknown> }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (init?.method === 'POST') return { ok: write.status < 300, status: write.status, json: async () => write.body }
    return { ok: true, status: 200, json: async () => load }
  }))
  return calls
}

test('money is shown in rupees with Indian grouping', () => {
  expect(rupees(22400050)).toBe('Rs 2,24,000.50')
  expect(rupees(620000)).toBe('Rs 6,200')
  expect(rupees(5)).toBe('Rs 0.05')
})

test('transfers, holds and the table of the accused with their statuses are shown, and money alone is said not to prove guilt', async () => {
  stub()
  render(<MoneyTrail firId="f1" />)
  expect(await screen.findByText('Moved out: Rs 2,34,000.50')).toBeTruthy()
  expect(screen.getByText('Frozen by banks: Rs 6,200')).toBeTruthy()
  expect(screen.getByText(/Money in an account alone does not prove guilt/)).toBeTruthy()
  const transfers = screen.getAllByRole('table')[0]
  expect(within(transfers).getByText('Rs 2,24,000.50')).toBeTruthy()
  expect(within(transfers).getByText('214/E-01')).toBeTruthy()
  const links = screen.getAllByRole('table')[2]
  expect(within(links).getByText('Both links')).toBeTruthy()
  expect(within(links).getByText('Money only')).toBeTruthy()
  expect(within(links).getByText('Second link only')).toBeTruthy()
  expect(within(links).getAllByText('None found').length).toBeGreaterThan(1)
  expect(within(links).getByText('Rs 2,24,000.50 credited')).toBeTruthy()
  expect(within(links).getByText('Marked as account holder')).toBeTruthy()
  expect(within(links).getByText('2 recorded')).toBeTruthy()
})

test('a transfer and a hold are sent with the amount as a number, and the form is cleared', async () => {
  const calls = stub()
  render(<MoneyTrail firId="f1" />)
  await screen.findByText('Record a transfer')
  fireEvent.change(screen.getByLabelText('From account'), { target: { value: 'Fictional A/c XXXX1' } })
  fireEvent.change(screen.getByLabelText('To account'), { target: { value: 'Fictional A/c XXXX2' } })
  fireEvent.change(screen.getByLabelText('Received by (an accused)'), { target: { value: 'a3' } })
  fireEvent.change(screen.getAllByLabelText('Amount in rupees')[0], { target: { value: '1600.5' } })
  fireEvent.change(screen.getAllByLabelText('Date of the bank entry')[0], { target: { value: '2026-08-25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save transfer' }))
  await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/firs/f1/money-trail/transfers', body: { from: 'Fictional A/c XXXX1', to: 'Fictional A/c XXXX2', toPersonId: 'a3', amount: 1600.5, date: '2026-08-25', evidenceId: '' } })

  fireEvent.change(screen.getByLabelText('Account held'), { target: { value: 'Fictional A/c XXXX4471' } })
  fireEvent.change(screen.getAllByLabelText('Amount in rupees')[1], { target: { value: '6200' } })
  fireEvent.change(screen.getAllByLabelText('Date of the bank entry')[1], { target: { value: '2026-09-03' } })
  fireEvent.change(screen.getAllByLabelText('Bank reply in the evidence register')[1], { target: { value: 'e1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save hold' }))
  await vi.waitFor(() => expect(calls.filter((c) => c.method === 'POST').length).toBe(2))
  expect(calls.filter((c) => c.method === 'POST')[1]).toMatchObject({ url: '/api/firs/f1/money-trail/holds', body: { account: 'Fictional A/c XXXX4471', amount: 6200, date: '2026-09-03', evidenceId: 'e1' } })
})

test('a refusal from the server is shown and the form keeps what was typed', async () => {
  stub({ status: 400, body: { message: 'The date cannot be in the future.' } })
  render(<MoneyTrail firId="f1" />)
  await screen.findByText('Record a transfer')
  fireEvent.change(screen.getByLabelText('From account'), { target: { value: 'Fictional A/c XXXX1' } })
  fireEvent.change(screen.getByLabelText('To account'), { target: { value: 'Fictional A/c XXXX2' } })
  fireEvent.change(screen.getAllByLabelText('Amount in rupees')[0], { target: { value: '10' } })
  fireEvent.change(screen.getAllByLabelText('Date of the bank entry')[0], { target: { value: '2099-01-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save transfer' }))
  expect((await screen.findByRole('alert')).textContent).toContain('future')
  expect((screen.getByLabelText('From account') as HTMLInputElement).value).toBe('Fictional A/c XXXX1')
})

test('empty and malformed answers are tolerated, and a failed load is shown', async () => {
  stub(undefined, { evidence: {}, transfers: {}, holds: {}, accused: {}, transferred_paise: 0, held_paise: 0 })
  render(<MoneyTrail firId="f1" />)
  expect(await screen.findByText('No transfer has been recorded yet.')).toBeTruthy()
  expect(screen.getByText('No accused is recorded in this case yet.')).toBeTruthy()
  cleanup()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not found' }) })))
  render(<MoneyTrail firId="f1" />)
  expect(await screen.findByRole('alert')).toBeTruthy()
})
