// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TypePage from './TypePage'
import { ScreenLangContext } from './i18n'
import { TypingContext, type TypingLang } from './typing'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const glossary = {
  status: 'draft', reviewNote: 'DRAFT, not reviewed.',
  entries: [
    { id: 'remand', term: 'Remand', law: 'BNSS 187', meaning: 'Custody ordered by a Magistrate.', terms: { hi: 'रिमांड', mr: 'कोठडी (रिमांड)', ta: 'காவல் நீட்டிப்பு (ரிமாண்ட்)' } },
    { id: 'witness', term: 'Witness', law: null, meaning: 'A person who knows facts of the case.', terms: { hi: 'गवाह', mr: 'साक्षीदार', ta: 'சாட்சி' } },
  ],
}

function page(answer: () => Promise<unknown>, screenLang = 'en', lang: TypingLang = 'en') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toBe('/api/glossary')
    return answer()
  }))
  render(<ScreenLangContext.Provider value={screenLang}><TypingContext.Provider value={{ lang, setLang: () => {} }}><TypePage /></TypingContext.Provider></ScreenLangContext.Provider>)
}
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body })

test('the glossary shows each term in the chosen language, says it is a draft, and adds a word to the text', async () => {
  page(ok(glossary))
  expect(await screen.findByRole('heading', { name: 'Legal glossary' })).toBeTruthy()
  expect(screen.getByText(/^Draft: these terms have not been checked/)).toBeTruthy()
  // neither the typing nor the screen language is an Indian one: Hindi first
  expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('hi')
  expect(screen.getByText('रिमांड').getAttribute('lang')).toBe('hi')
  expect(screen.getByText('BNSS 187')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'mr' } })
  expect(screen.getByText('साक्षीदार')).toBeTruthy()
  const box = screen.getByLabelText('Text') as HTMLTextAreaElement
  fireEvent.click(screen.getByRole('button', { name: 'Add कोठडी (रिमांड) to the text' }))
  expect(box.value).toBe('कोठडी (रिमांड)')
  fireEvent.click(screen.getByRole('button', { name: 'Add साक्षीदार to the text' }))
  expect(box.value).toBe('कोठडी (रिमांड) साक्षीदार')
})

test('finding a term matches the English term, the law or a word in any language', async () => {
  page(ok(glossary))
  const find = await screen.findByLabelText('Find a term')
  fireEvent.change(find, { target: { value: 'bnss 187' } })
  expect(screen.queryByText('Witness')).toBeNull()
  expect(screen.getByText('Remand')).toBeTruthy()
  fireEvent.change(find, { target: { value: 'சாட்சி' } })
  expect(screen.getByText('Witness')).toBeTruthy()
  expect(screen.queryByText('Remand')).toBeNull()
  fireEvent.change(find, { target: { value: 'no such word' } })
  expect(screen.getByText('No term matches.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('the typing language, else the screen language, picks the column; a reviewed glossary has no draft line', async () => {
  page(ok({ ...glossary, status: 'reviewed' }), 'mr', 'ta')
  expect(await screen.findByText('சாட்சி')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'कायदेशीर शब्दकोश' })).toBeTruthy()
  expect(screen.queryByText(/^मसुदा:/)).toBeNull()
  cleanup()
  page(ok(glossary), 'mr', 'en')
  expect(await screen.findByText('साक्षीदार')).toBeTruthy()
  expect(screen.getByText(/^मसुदा:/)).toBeTruthy()
})

test('a glossary that cannot be loaded says so', async () => {
  page(async () => ({ ok: false, status: 500, json: async () => ({}) }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/500/)
})
