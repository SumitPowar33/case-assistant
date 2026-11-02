// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { ai, can, changePassword, currentSession, get, getText, login, onSessionChange, send, setMessageLanguage, setScreenLanguage, setSession } from './api'

// Fictional data only.
afterEach(() => { vi.unstubAllGlobals(); setMessageLanguage('en'); setSession(null) })
const answer = (status: number, body: unknown = {}) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 300, status, json: async () => body })))

test('a refusal from the core is shown in the screen language; one no catalog knows stays as the server wrote it', async () => {
  setSession({ token: 't', user: { id: 'u1', username: 'io.one', full_name: 'IO One', rank: 'SI', role: 'io', station_id: 's1' } })
  setMessageLanguage('mr')
  answer(403, { message: 'Only the case team can do this.' })
  await expect(send('/firs/f1/people', 'POST', {})).rejects.toThrow('फक्त प्रकरणाची टीम हे करू शकते.')
  answer(400, { error: 'The database rejected this entry (a rule or a duplicate).' })
  await expect(send('/firs/f1/people', 'POST', {})).rejects.toThrow('डेटाबेसने ही नोंद नाकारली (एखादा नियम किंवा दुहेरी नोंद).')
  answer(409, { message: 'A rule this screen does not know.' })
  await expect(send('/x', 'POST', {})).rejects.toThrow('A rule this screen does not know.')
  answer(500)
  await expect(get('/firs')).rejects.toThrow('सर्व्हरने /firs साठी 500 उत्तर दिले')
  answer(401)
  await expect(get('/firs')).rejects.toThrow('तुमचे साइन-इन संपले. कृपया पुन्हा साइन इन करा.')
})

test('sign-in refusals in Hindi, and in English when the screen is English', async () => {
  setMessageLanguage('hi')
  answer(401)
  await expect(login('x', 'y')).rejects.toThrow('गलत यूज़रनेम या पासवर्ड।')
  answer(429, { error: 'Too many wrong passwords. Try again after 21:15 IST.' })
  await expect(login('x', 'y')).rejects.toThrow('बहुत अधिक गलत पासवर्ड। 21:15 IST के बाद फिर कोशिश करें।')
  setMessageLanguage('en')
  answer(429, { error: 'Too many wrong passwords. Try again after 21:15 IST.' })
  await expect(login('x', 'y')).rejects.toThrow('Too many wrong passwords. Try again after 21:15 IST.')
})

test('a refusal whose body is JSON null still says what the server answered', async () => {
  setSession({ token: 't', user: { id: 'u1', username: 'io.one', full_name: 'IO One', rank: 'SI', role: 'io', station_id: 's1' } })
  answer(404, null)
  await expect(send('/me/language', 'PUT', { language: 'xx' })).rejects.toThrow('The server answered 404')
})

const user = { id: 'u1', username: 'io.one', full_name: 'IO One', rank: 'SI', role: 'io', station_id: 's1', permissions: ['case.read'] }
function record(status = 200, body: unknown = {}, text = 'a,b') {
  const calls: { url: string; init: { method?: string; headers: Record<string, string>; body?: string } }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, init })
    return { ok: status < 300, status, json: async () => body, text: async () => text }
  }))
  return calls
}

test('every call carries the login token and a JSON type only when it has a body; without a session there is no token', async () => {
  const calls = record(200, { x: 1 })
  await get('/firs')
  expect(calls[0]).toEqual({ url: '/api/firs', init: { method: 'GET', headers: {}, body: undefined } })
  setSession({ token: 'tok', user })
  await get('/firs')
  expect(calls[1].init.headers).toEqual({ authorization: 'Bearer tok' })
  await send('/firs/f1/people', 'PUT', { a: 1 })
  expect(calls[2]).toEqual({ url: '/api/firs/f1/people', init: { method: 'PUT', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: '{"a":1}' } })
  expect(await getText('/export.csv')).toBe('a,b')
  expect(calls[3].url).toBe('/api/export.csv')
  await ai('/x', { method: 'POST', body: { q: 1 } })
  expect(calls[4]).toMatchObject({ url: '/ai/x', init: { method: 'POST', body: '{"q":1}' } })
})

test('the session is kept in the tab, listeners hear changes until they leave, and permissions come only from the session', () => {
  const heard = vi.fn()
  const off = onSessionChange(heard)
  expect(can('case.read')).toBe(false)
  setSession({ token: 'tok', user })
  expect(JSON.parse(sessionStorage.getItem('case-assistant-session')!)).toEqual({ token: 'tok', user })
  expect(can('case.read')).toBe(true)
  expect(can('audit.read_protected')).toBe(false)
  off()
  setSession(null)
  expect(heard).toHaveBeenCalledTimes(1)
  expect(sessionStorage.getItem('case-assistant-session')).toBeNull()
  expect(currentSession()).toBeNull()
})

test('a 401 ends the session; a failed read, text read and gateway call say what the server answered', async () => {
  setSession({ token: 'tok', user })
  record(401)
  await expect(get('/firs')).rejects.toThrow('Your sign-in has ended. Please sign in again.')
  expect(currentSession()).toBeNull()
  record(500)
  await expect(getText('/x.csv')).rejects.toThrow('The server answered 500 for /x.csv')
  await expect(ai('/x')).rejects.toThrow('The AI gateway answered 500 for /x')
  record(403, { detail: 'only the state admin can do this' })
  await expect(ai('/x')).rejects.toThrow('The AI gateway answered 403: only the state admin can do this')
  record(403, { detail: [{ loc: 'x' }] })
  await expect(ai('/x')).rejects.toThrow('The AI gateway answered 403 for /x')
  record(204)
  expect(await send('/x', 'POST', {})).toBeNull()
})

test('a failed sign-in is told apart: wrong password (401, 400), too many tries, other errors; success keeps the session', async () => {
  record(400)
  await expect(login('x', 'y')).rejects.toThrow('Wrong username or password.')
  record(429, {})
  await expect(login('x', 'y')).rejects.toThrow('Too many wrong passwords. Try again later.')
  record(503)
  await expect(login('x', 'y')).rejects.toThrow('The server answered 503. Please try again.')
  const calls = record(200, { token: 'new', user, extra: 'dropped' })
  await login('io.one', 'pw')
  expect(calls[0]).toEqual({ url: '/api/login', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"username":"io.one","password":"pw"}' } })
  expect(currentSession()).toEqual({ token: 'new', user })
})

test('changing the password swaps the token and keeps the user; a refusal says why; the screen language is kept on the server, then here', async () => {
  setSession({ token: 'old', user })
  const calls = record(200, { token: 'fresh' })
  await changePassword('cur', 'next')
  expect(calls[0]).toMatchObject({ url: '/api/me/password', init: { method: 'POST', body: '{"currentPassword":"cur","newPassword":"next"}' } })
  expect(currentSession()).toEqual({ token: 'fresh', user })
  record(400, { error: 'Wrong password' })
  await expect(changePassword('cur', 'next')).rejects.toThrow('Wrong password')
  record(200, {})
  await expect(changePassword('cur', 'next')).rejects.toThrow('The server answered 200')
  expect(currentSession()?.token).toBe('fresh')
  const lang = record(204)
  await setScreenLanguage('mr')
  expect(lang[0]).toMatchObject({ url: '/api/me/language', init: { method: 'PUT', body: '{"language":"mr"}' } })
  expect(currentSession()?.user.ui_language).toBe('mr')
})
