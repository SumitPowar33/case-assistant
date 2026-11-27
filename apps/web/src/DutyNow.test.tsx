// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DutyNow from './DutyNow'

// Fictional data only.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const officer = (id: string, full_name: string, post: string) => ({ id, full_name, rank: 'HC', post })
function stub(status: number, body: unknown) {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return { ok: status < 300, status, json: async () => body } }))
  return urls
}
const night = { now: { shift: 'night', on_duty: [officer('1', 'HC Fictional Desk', 'front_desk'), officer('2', 'HC Fictional Beat', 'beat'), officer('3', 'HC Fictional Van', 'patrol')] } }

test('the front desk sees everyone on duty now at the station, with a link to the roster', async () => {
  const urls = stub(200, night)
  render(<DutyNow station="s1" />)
  expect(await screen.findByRole('heading', { name: 'On duty now (Night (10 pm to 6 am) shift)' })).toBeTruthy()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['HC Fictional Desk (HC): Front desk', 'HC Fictional Beat (HC): Beat', 'HC Fictional Van (HC): Patrolling vehicle'])
  expect(screen.getByRole('link', { name: 'Duty roster' }).getAttribute('href')).toBe('#/roster')
  expect(urls).toEqual(['/api/duty-roster?stationId=s1'])
})

test('the 112 screen sees only the officers on beat and patrol', async () => {
  stub(200, night)
  render(<DutyNow station="s1" beat />)
  expect(await screen.findByRole('heading', { name: 'On beat and patrol now (Night (10 pm to 6 am) shift)' })).toBeTruthy()
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['HC Fictional Beat (HC): Beat', 'HC Fictional Van (HC): Patrolling vehicle'])
})

test('an empty shift says so, for all posts and for beat and patrol', async () => {
  stub(200, { now: { shift: 'morning', on_duty: [officer('1', 'HC Fictional Desk', 'front_desk')] } })
  render(<DutyNow station="s1" beat />)
  expect(await screen.findByText('Nobody is rostered for beat or patrol in this shift.')).toBeTruthy()
  cleanup()
  stub(200, { now: { shift: 'morning', on_duty: [] } })
  render(<DutyNow station="s1" />)
  expect(await screen.findByText('Nobody is rostered for this shift.')).toBeTruthy()
})

test('a roster that cannot be read says why, and an answer without it shows nothing', async () => {
  stub(403, {})
  render(<DutyNow station="s1" />)
  expect((await screen.findByRole('alert')).textContent).toContain('403')
  cleanup()
  const urls = stub(200, [])
  const { container } = render(<DutyNow station="s1" />)
  await vi.waitFor(() => expect(urls).toHaveLength(1))
  await new Promise((r) => setTimeout(r, 0))
  expect(container.innerHTML).toBe('')
})
