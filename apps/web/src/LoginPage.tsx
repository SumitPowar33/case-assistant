import { useState, type FormEvent } from 'react'
import { login } from './api'

export default function LoginPage() {
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
      <h1>Sign in</h1>
      <label>Username <input name="username" autoComplete="username" required autoFocus /></label>
      <label>Password <input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}
