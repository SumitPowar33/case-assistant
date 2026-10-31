// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { get, login, send, setMessageLanguage, setSession } from './api'

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
