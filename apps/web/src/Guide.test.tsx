// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelpChat, Tour } from './Guide'
import { setSession, type User } from './api'
import { screensFor } from './screens'

// Fictional data only.
const io: User = { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: 's1', permissions: [] }
beforeEach(() => setSession({ token: 't', user: io }))
afterEach(() => { cleanup(); window.location.hash = ''; vi.unstubAllGlobals(); setSession(null) })

test('the tour welcomes without leaving the screen, then opens each screen in menu order and says what it is for', () => {
  window.location.hash = '#/laws'
  const close = vi.fn()
  const screens = screensFor(io)
  render(<Tour screens={screens} onClose={close} />)
  expect(screen.getByRole('heading', { name: 'Welcome to Case Assistant' })).toBeTruthy()
  expect(window.location.hash).toBe('#/laws')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText(`Step 1 of ${screens.length}`)).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(window.location.hash).toBe('#/firs')
  expect(screen.getByText(/Open an FIR from this list/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(window.location.hash).toBe('#/')
  for (let i = 1; i < screens.length; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(window.location.hash).toBe(screens[screens.length - 1].href)
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
  expect(close).toHaveBeenCalledOnce()
})

test('the tour can end at any step', () => {
  const close = vi.fn()
  render(<Tour screens={screensFor(io)} onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'End the tour' }))
  expect(close).toHaveBeenCalledOnce()
})

type Reply = { status: number; body: unknown }
function stub(reply: Reply) {
  const calls: { url: string; body: { feature: string; prompt: string; case_ref?: string } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(init!.body as string) })
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }
  }))
  return calls
}
const ask = (q: string) => {
  fireEvent.change(screen.getByLabelText(/Your question/), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}
const draft = (text: string) => ({ status: 200, body: { request_id: 'r1', draft: text, provider: 'fake', model: 'm' } })

test('a question goes to the gateway as app_help with the screens only, and the screens the answer names become links', async () => {
  const screens = screensFor(io)
  const tag = `S${screens.findIndex((s) => s.href === '#/front-desk') + 1}`
  const calls = stub(draft(`1. Open Front desk [${tag}]. 2. Write the information down and have it signed.`))
  render(<HelpChat screens={screens} here="#/" onClose={() => {}} onTour={() => {}} />)
  ask('How do I register an FIR?')
  expect(await screen.findByText(/Write the information down and have it signed/)).toBeTruthy()
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toMatch(/\/v1\/generate$/)
  expect(calls[0].body.feature).toBe('app_help')
  expect(calls[0].body.case_ref).toBeUndefined()
  expect(calls[0].body.prompt).toContain('Question from an officer using the Case Assistant app: How do I register an FIR?')
  expect(screen.getByRole('link', { name: 'Open Front desk' }).getAttribute('href')).toBe('#/front-desk')
  expect(screen.getByText('AI answer · check it on the screen')).toBeTruthy()
})

test('an answer naming no screen is marked, "not in the app" is shown as such, and a gateway refusal is shown', async () => {
  stub(draft('Press the button.'))
  const { unmount } = render(<HelpChat screens={screensFor(io)} here="#/" onClose={() => {}} onTour={() => {}} />)
  ask('How do I print?')
  expect(await screen.findByText('names no screen')).toBeTruthy()
  unmount()
  stub(draft('NOT IN THE APP'))
  render(<HelpChat screens={screensFor(io)} here="#/" onClose={() => {}} onTour={() => {}} />)
  ask('How do I book leave?')
  expect(await screen.findByText('The app does not cover this')).toBeTruthy()
  expect(screen.queryByText('NOT IN THE APP')).toBeNull()
  cleanup()
  stub({ status: 429, body: { detail: 'Too many drafts' } })
  render(<HelpChat screens={screensFor(io)} here="#/" onClose={() => {}} onTour={() => {}} />)
  ask('How do I print?')
  expect(await screen.findByRole('alert')).toBeTruthy()
})

test('the chat offers the tour and closes', () => {
  const tour = vi.fn(), close = vi.fn()
  render(<HelpChat screens={screensFor(io)} here="#/" onClose={close} onTour={tour} />)
  fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(tour).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})
