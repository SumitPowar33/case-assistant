// Every call carries the login token from the core app (POST /api/login). The AI gateway checks the same token.
// The session lives in sessionStorage, so it ends when the browser tab closes; a 401 from either server ends it too.
export type User = { id: string; username: string; full_name: string; rank: string; role: string; station_id: string | null }
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

// The AI gateway (services/ai-gateway) is served under /ai.
export async function ai<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await call(`/ai${path}`, init)
  if (res.status === 403) throw new Error('Only the state admin can change AI settings.')
  if (!res.ok) throw new Error(`The AI gateway answered ${res.status} for ${path}`)
  return res.json() as Promise<T>
}
