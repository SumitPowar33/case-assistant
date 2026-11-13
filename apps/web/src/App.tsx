import { Fragment, useEffect, useState, useSyncExternalStore } from 'react'
import FirList from './FirList'
import Dashboard from './Dashboard'
import { isPart } from './firParts'
import { screensFor, type Group } from './screens'
import { HelpChat, Tour } from './Guide'
import FirDetail from './FirDetail'
import TypePage from './TypePage'
import SettingsPage from './SettingsPage'
import PasswordPage from './PasswordPage'
import AdminPage from './AdminPage'
import ImportPage from './ImportPage'
import PoliciesPage from './PoliciesPage'
import AuditPage from './AuditPage'
import StatePage from './StatePage'
import ActingPage from './ActingPage'
import ReadsPage from './ReadsPage'
import Supervisor from './Supervisor'
import Property from './Property'
import ExpertRequests from './ExpertRequests'
import Court from './Court'
import LawFinder from './LawFinder'
import LoginPage from './LoginPage'
import { ComplaintPage, FrontDeskPage } from './FrontDesk'
import { currentSession, onSessionChange, setMessageLanguage, setScreenLanguage, signOut } from './api'
import { REVIEWED, SCREEN_LANGS, ScreenLangContext, translate, type Key } from './i18n'
import { LANGS, TypingContext, type TypingLang } from './typing'
import { fmt } from './formats'

const GROUP_HEAD: Record<Group, Key | null> = { main: null, case: 'nav.groupCase', station: 'nav.groupStation', tools: 'nav.groupTools', admin: 'nav.admin' }
// the tour starts by itself once per user on this browser; storage may be missing (private window), then it is simply offered
const tourKey = (userId: string) => `tour-seen:${userId}`
function tourSeen(userId: string) { try { return localStorage.getItem(tourKey(userId)) === '1' } catch { return true } }
function markTourSeen(userId: string) { try { localStorage.setItem(tourKey(userId), '1') } catch { /* nothing kept */ } }

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  const [lang, setLang] = useState<TypingLang>('en')
  const [menuOpen, setMenuOpen] = useState(false)   // phones: the menu and language choices fold away
  useEffect(() => {
    const on = () => { setHash(window.location.hash); setMenuOpen(false) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const session = useSyncExternalStore(onSessionChange, currentSession)
  const firMatch = /^#\/firs\/([\w-]+)(?:\/([\w-]+))?$/.exec(hash)
  const firId = firMatch?.[1]
  const firPart = isPart(firMatch?.[2]) ? firMatch?.[2] : undefined
  const complaintId = /^#\/complaints\/([\w-]+)$/.exec(hash)?.[1]
  const screens = session ? screensFor(session.user, firId) : []
  // the menu names the case file once; its parts are tabs on the FIR screen (the tour and the help chat still know each part)
  const menu = screens.filter((sc) => sc.group !== 'case' || sc.label === 'nav.wholeCase')
  const [guide, setGuide] = useState<'help' | 'tour' | null>(null)
  const userId = session?.user.id
  useEffect(() => { setGuide(userId && !tourSeen(userId) ? 'tour' : null) }, [userId])
  function endTour() { if (userId) markTourSeen(userId); setGuide(null) }
  // the signed-in user's screen language (kept on the server); before sign-in, the one chosen on this page
  const [chosen, setChosen] = useState('en')
  const [langError, setLangError] = useState('')
  const screen = session?.user.ui_language && SCREEN_LANGS.includes(session.user.ui_language) ? session.user.ui_language : chosen
  setMessageLanguage(screen)   // during render, so the first loads of the screens below already use it
  useEffect(() => { document.documentElement.lang = screen }, [screen])
  // signed out: the sign-in card stands alone in the middle of the screen (index.css, .signed-out)
  useEffect(() => { document.body.classList.toggle('signed-out', !session) }, [session])
  const t = (key: Key) => translate(screen, key)
  const here = hash || '#/'
  const link = (href: string, label: string) => <a href={href} aria-current={here === href ? 'page' : undefined}>{label}</a>
  async function chooseScreen(code: string) {
    setLangError('')
    setChosen(code)
    if (session) await setScreenLanguage(code).catch((e: Error) => setLangError(e.message))
  }
  return (
    <ScreenLangContext.Provider value={screen}>
    <TypingContext.Provider value={{ lang, setLang }}>
      <header>
        <a className="brand" href="#/"><span className="brand-tile" aria-hidden="true">CA</span>
          <span><strong>Case Assistant</strong>{session && <small>{session.user.station_name ?? session.user.rank}</small>}</span></a>
        <button type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="header-menu" onClick={() => setMenuOpen(!menuOpen)}>{t('header.menu')}</button>
        <div id="header-menu" className={menuOpen ? 'header-menu open' : 'header-menu'}>
        {session && <nav aria-label={t('nav.main')} onClick={() => setMenuOpen(false)}>
          {menu.map((sc, i) => <Fragment key={sc.href}>
            {GROUP_HEAD[sc.group] && menu[i - 1]?.group !== sc.group && <div className="nav-group">{t(GROUP_HEAD[sc.group]!)}</div>}
            {link(sc.href, t(sc.label))}
          </Fragment>)}
        </nav>}
        <label>{t('header.screenLanguage')}
          <select value={screen} onChange={(e) => void chooseScreen(e.target.value)}>
            {SCREEN_LANGS.map((code) => <option key={code} value={code} lang={code}>
              {code === 'en' ? 'English' : `${LANGS[code as keyof typeof LANGS]?.label ?? code} (${LANGS[code as keyof typeof LANGS]?.name ?? code})`}
              {REVIEWED.has(code) ? '' : ` – ${translate(code, 'header.draft')}`}</option>)}
          </select>
        </label>
        {langError && <span role="alert">{langError}</span>}
        <label>{t('header.typingLanguage')}
          <select value={lang} onChange={(e) => setLang(e.target.value as TypingLang)}>
            <option value="en">{t('header.noConversion')}</option>
            {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code} lang={l.tag}>{l.label} ({l.name})</option>)}
          </select>
        </label>
        {session && <div className="who"><strong>{session.user.full_name}</strong><span>{session.user.rank}</span>
          <button type="button" onClick={() => void signOut()}>{t('header.signOut')}</button></div>}
        </div>
      </header>
      <div className="topstrip">
        <span className="chip demo-chip">{t('app.tagline')}</span>
        {session?.user.acting?.map((a) => <span key={a.role} className="chip demo-chip" role="status">{t('acting.banner').replace('{role}', a.role.toUpperCase()).replace('{date}', fmt(a.ends_at))}</span>)}
        {session && <span className="guide-actions">
          <button type="button" onClick={() => setGuide('tour')}>{t('help.tour')}</button>
          <button type="button" aria-expanded={guide === 'help'} onClick={() => setGuide(guide === 'help' ? null : 'help')}>{t('help.open')}</button>
        </span>}
      </div>
      {session && guide === 'tour' && <Tour screens={screens} onClose={endTour} />}
      {session && guide === 'help' && <HelpChat screens={screens} here={here} onClose={() => setGuide(null)} onTour={() => setGuide('tour')} />}
      <main>{!session ? <LoginPage /> : firId ? <FirDetail key={firId} id={firId} only={firPart} /> : complaintId ? <ComplaintPage id={complaintId} /> : hash === '#/front-desk' ? <FrontDeskPage /> : hash === '#/type' ? <TypePage /> : hash === '#/settings' ? <SettingsPage /> : hash === '#/password' ? <PasswordPage /> : hash === '#/admin' ? <AdminPage /> : hash === '#/import' ? <ImportPage /> : hash === '#/policies' ? <PoliciesPage /> : hash === '#/reads' ? <ReadsPage /> : hash === '#/audit' ? <AuditPage /> : hash === '#/state-setup' ? <StatePage /> : hash === '#/acting' ? <ActingPage /> : hash === '#/supervisor' ? <Supervisor /> : hash === '#/property' ? <Property /> : hash === '#/expert' ? <ExpertRequests /> : hash === '#/court' ? <Court /> : hash === '#/laws' ? <LawFinder /> : hash === '#/firs' ? <FirList /> : <Dashboard />}</main>
    </TypingContext.Provider>
    </ScreenLangContext.Provider>
  )
}
