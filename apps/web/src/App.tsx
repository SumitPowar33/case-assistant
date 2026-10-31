import { useEffect, useState, useSyncExternalStore } from 'react'
import FirList from './FirList'
import FirDetail from './FirDetail'
import TypePage from './TypePage'
import SettingsPage from './SettingsPage'
import PasswordPage from './PasswordPage'
import AdminPage from './AdminPage'
import ImportPage from './ImportPage'
import PoliciesPage from './PoliciesPage'
import LoginPage from './LoginPage'
import { ComplaintPage, FrontDeskPage } from './FrontDesk'
import { currentSession, onSessionChange, setScreenLanguage, setSession } from './api'
import { REVIEWED, SCREEN_LANGS, ScreenLangContext, translate, type Key } from './i18n'
import { LANGS, TypingContext, type TypingLang } from './typing'

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  const [lang, setLang] = useState<TypingLang>('en')
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const session = useSyncExternalStore(onSessionChange, currentSession)
  const firId = /^#\/firs\/([\w-]+)$/.exec(hash)?.[1]
  const complaintId = /^#\/complaints\/([\w-]+)$/.exec(hash)?.[1]
  const admin = session?.user.permissions?.includes('admin.manage') ?? false
  // the signed-in user's screen language (kept on the server); before sign-in, the one chosen on this page
  const [chosen, setChosen] = useState('en')
  const [langError, setLangError] = useState('')
  const screen = session?.user.ui_language && SCREEN_LANGS.includes(session.user.ui_language) ? session.user.ui_language : chosen
  useEffect(() => { document.documentElement.lang = screen }, [screen])
  const t = (key: Key) => translate(screen, key)
  async function chooseScreen(code: string) {
    setLangError('')
    setChosen(code)
    if (session) await setScreenLanguage(code).catch((e: Error) => setLangError(e.message))
  }
  return (
    <ScreenLangContext.Provider value={screen}>
    <TypingContext.Provider value={{ lang, setLang }}>
      <header>
        <strong>Case Assistant</strong> <small>{t('app.tagline')}</small>
        {session && <nav aria-label={t('nav.main')}><a href="#/">{t('nav.firs')}</a>{session.user.station_id && <> <a href="#/front-desk">{t('nav.frontDesk')}</a></>} <a href="#/type">{t('nav.type')}</a> <a href="#/policies">{t('nav.policies')}</a> <a href="#/password">{t('nav.password')}</a>{session.user.can_import && <> <a href="#/import">{t('nav.import')}</a></>}{admin && <> <a href="#/admin">{t('nav.admin')}</a> <a href="#/settings">{t('nav.settings')}</a></>}</nav>}
        <label>{t('header.screenLanguage')}{' '}
          <select value={screen} onChange={(e) => void chooseScreen(e.target.value)}>
            {SCREEN_LANGS.map((code) => <option key={code} value={code} lang={code}>
              {code === 'en' ? 'English' : `${LANGS[code as keyof typeof LANGS]?.label ?? code} (${LANGS[code as keyof typeof LANGS]?.name ?? code})`}
              {REVIEWED.has(code) ? '' : ` – ${translate(code, 'header.draft')}`}</option>)}
          </select>
        </label>
        {langError && <span role="alert">{langError}</span>}
        <label>{t('header.typingLanguage')}{' '}
          <select value={lang} onChange={(e) => setLang(e.target.value as TypingLang)}>
            <option value="en">{t('header.noConversion')}</option>
            {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code} lang={l.tag}>{l.label} ({l.name})</option>)}
          </select>
        </label>
        {session && <span className="who">{session.user.full_name} ({session.user.rank})
          <button type="button" onClick={() => setSession(null)}>{t('header.signOut')}</button></span>}
      </header>
      <main>{!session ? <LoginPage /> : firId ? <FirDetail id={firId} /> : complaintId ? <ComplaintPage id={complaintId} /> : hash === '#/front-desk' ? <FrontDeskPage /> : hash === '#/type' ? <TypePage /> : hash === '#/settings' ? <SettingsPage /> : hash === '#/password' ? <PasswordPage /> : hash === '#/admin' ? <AdminPage /> : hash === '#/import' ? <ImportPage /> : hash === '#/policies' ? <PoliciesPage /> : <FirList />}</main>
    </TypingContext.Provider>
    </ScreenLangContext.Provider>
  )
}
