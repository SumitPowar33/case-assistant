// Every call carries the login token from the core app (POST /api/login). The AI gateway checks the same token.
// The session lives in sessionStorage, so it ends when the browser tab closes; a 401 from either server ends it too.
export type User = { id: string; username: string; full_name: string; rank: string; role: string; station_id: string | null; can_import?: boolean; can_set_policy?: boolean }
export type Session = { token: string; user: User }

const KEY = 'case-assistant-session'
let session: Session | null = (() => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null } catch { return null }
})()
const listeners = new Set<() => void>()

export const currentSession = () => session
export function onSessionChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function setSession(s: Session | null) {
  session = s
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY) } catch { /* private mode: keep it in memory */ }
  listeners.forEach((fn) => fn())
}

export async function login(username: string, password: string) {
  const res = await fetch('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (res.status === 401 || res.status === 400) throw new Error('Wrong username or password.')
  if (res.status === 429) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Too many wrong passwords. Try again later.')
  if (!res.ok) throw new Error(`The server answered ${res.status}. Please try again.`)
  const body = await res.json() as Session
  setSession({ token: body.token, user: body.user })
}

async function call(url: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = session ? { authorization: `Bearer ${session.token}` } : {}
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(url, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
  if (res.status === 401) {
    setSession(null)
    throw new Error('Your sign-in has ended. Please sign in again.')
  }
  return res
}

export async function get<T>(path: string): Promise<T> {
  const res = await call(`/api${path}`)
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${path}`)
  return res.json() as Promise<T>
}

/** A plain-text download (e.g. a CSV) fetched with the login token. */
export async function getText(path: string): Promise<string> {
  const res = await call(`/api${path}`)
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${path}`)
  return res.text()
}

// Writes to the core app. The server's own message (e.g. "Only the case team can do this.") is shown to the user.
export async function send<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T | null> {
  const res = await call(`/api${path}`, { method, body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: string }
    throw new Error(err.message || err.error || `The server answered ${res.status}`)
  }
  return res.status === 204 ? null : res.json() as Promise<T>
}

// The AI gateway (services/ai-gateway) is served under /ai.
export async function ai<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await call(`/ai${path}`, init)
  if (!res.ok) {
    // the gateway's own reason, e.g. "ANTHROPIC_API_KEY is not set" or "only the state admin can do this"
    const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail
    throw new Error(`The AI gateway answered ${res.status}${typeof detail === 'string' ? `: ${detail}` : ` for ${path}`}`)
  }
  return res.json() as Promise<T>
}

// Changing the password ends every older token (here and in other tabs); the new token replaces this tab's one.
export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await call('/api/me/password', { method: 'POST', body: { currentPassword, newPassword } })
  const body = await res.json().catch(() => ({})) as { token?: string; error?: string; message?: string }
  if (!res.ok || !body.token) throw new Error(body.error || body.message || `The server answered ${res.status}`)
  setSession({ ...session!, token: body.token })
}
