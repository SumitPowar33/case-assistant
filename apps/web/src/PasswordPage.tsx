import { useState, type FormEvent } from 'react'
import { changePassword } from './api'

/** Change your own password. Every other sign-in with the old password ends. */
export default function PasswordPage() {
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const f = new FormData(formEl)
    const next = String(f.get('next'))
    if (next !== String(f.get('repeat'))) { setMessage({ ok: false, text: 'The two new passwords are not the same.' }); return }
    setBusy(true); setMessage(undefined)
    try {
      await changePassword(String(f.get('current')), next)
      formEl.reset()
      setMessage({ ok: true, text: 'Password changed. Other sign-ins with the old password have ended.' })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
    setBusy(false)
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>Change password</h1>
      <label>Current password <input name="current" type="password" autoComplete="current-password" required /></label>
      <label>New password (at least 12 characters) <input name="next" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label>New password again <input name="repeat" type="password" autoComplete="new-password" minLength={12} required /></label>
      {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  )
}
