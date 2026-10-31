import { useState, type FormEvent } from 'react'
import { changePassword } from './api'
import { useT } from './i18n'

/** Change your own password. Every other sign-in with the old password ends. */
export default function PasswordPage() {
  const t = useT()
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const f = new FormData(formEl)
    const next = String(f.get('next'))
    if (next !== String(f.get('repeat'))) { setMessage({ ok: false, text: t('password.mismatch') }); return }
    setBusy(true); setMessage(undefined)
    try {
      await changePassword(String(f.get('current')), next)
      formEl.reset()
      setMessage({ ok: true, text: t('password.done') })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
    setBusy(false)
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>{t('password.title')}</h1>
      <label>{t('password.current')} <input name="current" type="password" autoComplete="current-password" required /></label>
      <label>{t('password.new')} <input name="next" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label>{t('password.repeat')} <input name="repeat" type="password" autoComplete="new-password" minLength={12} required /></label>
      {message && <p role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <button type="submit" disabled={busy}>{busy ? t('password.busy') : t('password.submit')}</button>
    </form>
  )
}
