// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import SettingsPage from './SettingsPage'
import { ScreenLangContext } from './i18n'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function mockGateway(chainOk = true) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  let notice = { label: 'Draft notices', provider: 'claude', model: 'claude-sonnet-5-5', officer_may_switch: true }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body && JSON.parse(init.body as string) })
    let body: unknown
    if (url === '/ai/v1/settings') body = { notice_draft: notice }
    else if (url === '/ai/v1/features') body = { providers: ['claude', 'fake', 'gemini'], default_models: { claude: 'claude-sonnet-5-5', gemini: 'gemini-3.7-flash', fake: 'fake-1' } }
    // as the gateway answers since 31 Oct: /health says only that it runs; the chain check is on /v1/audit (admins)
    else if (url === '/ai/health') body = { ok: true }
    else if (url === '/ai/v1/audit?limit=1') body = { chain_ok: chainOk, rows: [] }
    else if (url === '/ai/v1/settings/notice_draft') {
      const b = JSON.parse(init!.body as string)
      notice = { ...notice, provider: b.provider, model: b.model ?? 'gemini-3.7-flash', officer_may_switch: b.officer_may_switch }
      body = notice
    }
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body }
  }))
  return calls
}

test('admin switches a feature to Gemini and locks it; the gateway default model is used', async () => {
  const calls = mockGateway()
  render(<SettingsPage />)
  expect(await screen.findByText(/Audit log check: intact/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Provider for Draft notices'), { target: { value: 'gemini' } })
  expect((screen.getByLabelText('Model for Draft notices') as HTMLInputElement).placeholder).toBe('gemini-3.7-flash')
  fireEvent.click(screen.getByLabelText('Officer may switch for Draft notices'))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft notices' }))
  expect(await screen.findByText('Saved: Draft notices now uses gemini / gemini-3.7-flash.')).toBeTruthy()
  const put = calls.find((c) => c.method === 'PUT')!
  expect(put.body).toEqual({ provider: 'gemini', model: null, officer_may_switch: false })
})

test('a broken audit chain is shown plainly', async () => {
  mockGateway(false)
  render(<SettingsPage />)
  expect(await screen.findByText(/Audit log check: broken/)).toBeTruthy()
})

test('in Marathi: headings, the audit check, every control and the saved line; feature labels, providers and models stay as the gateway sends them', async () => {
  const calls = mockGateway()
  render(<ScreenLangContext.Provider value="mr"><SettingsPage /></ScreenLangContext.Provider>)
  expect(await screen.findByRole('heading', { name: 'AI सेटिंग्ज' })).toBeTruthy()
  expect(screen.getByText(/ऑडिट लॉग तपासणी: अबाधित\./)).toBeTruthy()
  expect(screen.getByText(/^फक्त राज्य ॲडमिन बदल जतन करू शकतात\./)).toBeTruthy()
  for (const name of ['सुविधा', 'प्रदाता', 'मॉडेल', 'अधिकारी बदलू शकतात']) expect(screen.getByRole('columnheader', { name })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Draft notices साठी प्रदाता'), { target: { value: 'fake' } })
  fireEvent.change(screen.getByLabelText('Draft notices साठी मॉडेल'), { target: { value: 'fake-1' } })
  fireEvent.click(screen.getByLabelText('Draft notices साठी अधिकारी बदलू शकतात'))
  fireEvent.click(screen.getByRole('button', { name: 'Draft notices जतन करा' }))
  expect(await screen.findByText('जतन केले: Draft notices आता fake / fake-1 वापरते.')).toBeTruthy()
  expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ provider: 'fake', model: 'fake-1', officer_may_switch: false })
  cleanup()
  mockGateway(false)
  render(<ScreenLangContext.Provider value="hi"><SettingsPage /></ScreenLangContext.Provider>)
  expect(await screen.findByText('ऑडिट लॉग जाँच: टूटा हुआ। राज्य एडमिन को इसकी सूचना दें।')).toBeTruthy()
})

test('a refused save (not the state admin) is shown and nothing is claimed saved', async () => {
  mockGateway()
  const inner = vi.mocked(fetch).getMockImplementation()!
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => init?.method === 'PUT'
    ? { ok: false, status: 403, json: async () => ({ detail: 'Only an account allowed to manage the installation may change AI settings.' }) }
    : inner(url, init)))
  render(<SettingsPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save Draft notices' }))
  expect((await screen.findByRole('alert')).textContent).toMatch(/403|manage the installation/)
  expect(screen.queryByText(/^Saved:/)).toBeNull()
})
