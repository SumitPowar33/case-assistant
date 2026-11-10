import { useEffect, useState, useSyncExternalStore } from 'react'
import FirList from './FirList'
import Dashboard from './Dashboard'
import { PARTS, PART_LABEL, isPart } from './firParts'
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
  const admin = session?.user.permissions?.includes('admin.manage') ?? false
  const supervisor = session?.user.permissions?.includes('chargesheet.approve') ?? false
  const auditor = session?.user.permissions?.includes('audit.read_protected') ?? false
  const actingGrantor = session?.user.permissions?.includes('acting.grant') ?? false
  const packWork = (session?.user.permissions?.includes('pack.propose') || session?.user.permissions?.includes('pack.approve')) ?? false
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
          {link('#/', t('nav.dashboard'))}
          {link('#/firs', t('nav.firs'))}
          {session.user.station_id && link('#/front-desk', t('nav.frontDesk'))}
          {firId && <>
            <div className="nav-group">{t('nav.groupCase')}</div>
            {link(`#/firs/${firId}`, t('nav.wholeCase'))}
            {PARTS.map((p) => <span key={p}>{link(`#/firs/${firId}/${p}`, t(PART_LABEL[p]))}</span>)}
          </>}
          <div className="nav-group">{t('nav.groupStation')}</div>
          {link('#/policies', t('nav.policies'))}
          {session.user.can_import && link('#/import', t('nav.import'))}
          {session.user.station_id && link('#/property', t('nav.property'))}
          {session.user.station_id && link('#/expert', t('nav.expert'))}
          {session.user.station_id && link('#/court', t('nav.court'))}
          {supervisor && link('#/supervisor', t('nav.supervisor'))}
          {auditor && link('#/reads', t('nav.reads'))}
          {auditor && link('#/audit', t('nav.audit'))}
          {packWork && link('#/state-setup', t('nav.state'))}
          {actingGrantor && link('#/acting', t('nav.acting'))}
          <div className="nav-group">{t('nav.groupTools')}</div>
          {link('#/type', t('nav.type'))}
          {link('#/laws', t('nav.laws'))}
          {link('#/password', t('nav.password'))}
          {admin && <>
            <div className="nav-group">{t('nav.admin')}</div>
            {link('#/admin', t('nav.admin'))}
            {link('#/settings', t('nav.settings'))}
          </>}
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
      </div>
      <main>{!session ? <LoginPage /> : firId ? <FirDetail key={firId} id={firId} only={firPart} /> : complaintId ? <ComplaintPage id={complaintId} /> : hash === '#/front-desk' ? <FrontDeskPage /> : hash === '#/type' ? <TypePage /> : hash === '#/settings' ? <SettingsPage /> : hash === '#/password' ? <PasswordPage /> : hash === '#/admin' ? <AdminPage /> : hash === '#/import' ? <ImportPage /> : hash === '#/policies' ? <PoliciesPage /> : hash === '#/reads' ? <ReadsPage /> : hash === '#/audit' ? <AuditPage /> : hash === '#/state-setup' ? <StatePage /> : hash === '#/acting' ? <ActingPage /> : hash === '#/supervisor' ? <Supervisor /> : hash === '#/property' ? <Property /> : hash === '#/expert' ? <ExpertRequests /> : hash === '#/court' ? <Court /> : hash === '#/laws' ? <LawFinder /> : hash === '#/firs' ? <FirList /> : <Dashboard />}</main>
    </TypingContext.Provider>
    </ScreenLangContext.Provider>
  )
}
