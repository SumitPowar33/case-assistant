import { useEffect, useState } from 'react'
import FirList from './FirList'
import FirDetail from './FirDetail'

export default function App() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const firId = /^#\/firs\/([\w-]+)$/.exec(hash)?.[1]
  return (
    <>
      <header>
        <strong>Case Assistant</strong> <small>demo · fictional data only · the AI drafts, a person decides</small>
        <nav aria-label="Main"><a href="#/">FIRs</a></nav>
      </header>
      <main>{firId ? <FirDetail id={firId} /> : <FirList />}</main>
    </>
  )
}
