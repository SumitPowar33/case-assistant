import { useEffect, useState, useSyncExternalStore } from 'react'
import FirList from './FirList'
import FirDetail from './FirDetail'
import TypePage from './TypePage'
import SettingsPage from './SettingsPage'
import LoginPage from './LoginPage'
import { currentSession, onSessionChange, setSession } from './api'
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
  const admin = session?.user.role === 'state_admin'
  return (
    <TypingContext.Provider value={{ lang, setLang }}>
      <header>
        <strong>Case Assistant</strong> <small>demo · fictional data only · the AI drafts, a person decides</small>
        {session && <nav aria-label="Main"><a href="#/">FIRs</a> <a href="#/type">Type</a>{admin && <> <a href="#/settings">AI settings</a></>}</nav>}
        <label>Typing language{' '}
          <select value={lang} onChange={(e) => setLang(e.target.value as TypingLang)}>
            <option value="en">English (no conversion)</option>
            {Object.entries(LANGS).map(([code, l]) => <option key={code} value={code} lang={l.tag}>{l.label} ({l.name})</option>)}
          </select>
        </label>
        {session && <span className="who">{session.user.full_name} ({session.user.rank})
          <button type="button" onClick={() => setSession(null)}>Sign out</button></span>}
      </header>
      <main>{!session ? <LoginPage /> : firId ? <FirDetail id={firId} /> : hash === '#/type' ? <TypePage /> : hash === '#/settings' ? <SettingsPage /> : <FirList />}</main>
    </TypingContext.Provider>
  )
}
