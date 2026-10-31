import { useState, type FormEvent } from 'react'
import { login } from './api'
import { useT } from './i18n'

export default function LoginPage() {
  const t = useT()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true); setError('')
    try {
      await login(String(form.get('username')), String(form.get('password')))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>{t('login.title')}</h1>
      <label>{t('login.username')} <input name="username" autoComplete="username" required autoFocus /></label>
      <label>{t('login.password')} <input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? t('login.busy') : t('login.submit')}</button>
    </form>
  )
}
