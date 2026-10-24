// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PasswordPage from './PasswordPage'
import LoginPage from './LoginPage'
import { currentSession, setSession } from './api'

beforeEach(() => setSession({ token: 'tok-old', user: { id: 'u1', username: 'si.fictional', full_name: 'SI Fictional', rank: 'SI', role: 'io', station_id: null } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setSession(null) })

function stub(status: number, body: unknown) {
  const fetch = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function fill(current: string, next: string, repeat: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText(/^New password \(/), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value: repeat } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

test('a changed password replaces this tab’s token', async () => {
  const fetch = stub(200, { token: 'tok-new', expiresInSeconds: 28800 })
  render(<PasswordPage />)
  fill('fictional-old-pass', 'fictional-new-pass-1', 'fictional-new-pass-1')
  expect((await screen.findByRole('status')).textContent).toMatch(/Password changed/)
  expect(currentSession()!.token).toBe('tok-new')
  expect(fetch).toHaveBeenCalledWith('/api/me/password', expect.objectContaining({ method: 'POST',
    body: JSON.stringify({ currentPassword: 'fictional-old-pass', newPassword: 'fictional-new-pass-1' }) }))
})

test('different repeats are caught before sending; a wrong current password shows the server message', async () => {
  const fetch = stub(403, { error: 'The current password is wrong.' })
  render(<PasswordPage />)
  fill('fictional-old-pass', 'fictional-new-pass-1', 'fictional-new-pass-2')
  expect((await screen.findByRole('alert')).textContent).toBe('The two new passwords are not the same.')
  expect(fetch).not.toHaveBeenCalled()
  fill('wrong-old-pass-1', 'fictional-new-pass-1', 'fictional-new-pass-1')
  expect((await screen.findByRole('alert')).textContent).toBe('The current password is wrong.')
  expect(currentSession()!.token).toBe('tok-old')
})

test('a locked sign-in shows when to try again', async () => {
  setSession(null)
  stub(429, { error: 'Too many wrong passwords. Try again after 02:45 IST.' })
  render(<LoginPage />)
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'si.fictional' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'fictional-guess' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Too many wrong passwords. Try again after 02:45 IST.')
})
