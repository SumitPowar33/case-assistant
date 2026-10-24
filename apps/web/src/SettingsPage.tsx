import { useEffect, useState } from 'react'
import { actor, ai } from './api'

type Setting = { label: string; provider: string; model: string; officer_may_switch: boolean }
type Features = { providers: string[]; default_models: Record<string, string> }

/** Admin screen: which AI provider and model each feature uses, and whether officers may switch. Every save is audit-logged by the gateway. */
export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, Setting>>()
  const [features, setFeatures] = useState<Features>()
  const [chainOk, setChainOk] = useState<boolean>()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    Promise.all([ai<Record<string, Setting>>('/v1/settings'), ai<Features>('/v1/features'), ai<{ audit_chain_ok: boolean }>('/health')])
      .then(([s, f, h]) => { setSettings(s); setFeatures(f); setChainOk(h.audit_chain_ok) }, (e: Error) => setError(e.message))
  }, [])

  if (error && !settings) return <p role="alert">{error}</p>
  if (!settings || !features) return <p>Loading…</p>

  const edit = (feature: string, change: Partial<Setting>) =>
    setSettings((cur) => cur && { ...cur, [feature]: { ...cur[feature], ...change } })
  async function save(feature: string) {
    const s = settings![feature]
    setError(''); setSaved('')
    try {
      const out = await ai<Setting>(`/v1/settings/${feature}`, {
        method: 'PUT', body: { provider: s.provider, model: s.model || null, officer_may_switch: s.officer_may_switch, ...(actor ? { actor } : {}) },
      })
      edit(feature, out)
      setSaved(`Saved: ${out.label} now uses ${out.provider} / ${out.model}.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h1>AI settings</h1>
      <p>Choose the AI provider and model for each feature. Every change is written to the audit log.
        {' '}{chainOk ? 'Audit log check: intact.' : <strong>Audit log check: broken. Report this to the state admin.</strong>}</p>
      <p><small>Admin only once login is built. "fake" gives offline demo drafts.</small></p>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">{saved}</p>
      <table>
        <caption>Provider per feature</caption>
        <thead><tr><th scope="col">Feature</th><th scope="col">Provider</th><th scope="col">Model</th><th scope="col">Officer may switch</th><th scope="col"><span className="visually-hidden">Save</span></th></tr></thead>
        <tbody>
          {Object.entries(settings).map(([f, s]) => (
            <tr key={f}>
              <th scope="row">{s.label}</th>
              <td>
                <select aria-label={`Provider for ${s.label}`} value={s.provider} onChange={(e) => edit(f, { provider: e.target.value, model: '' })}>
                  {features.providers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </td>
              <td><input aria-label={`Model for ${s.label}`} value={s.model} placeholder={features.default_models[s.provider]} onChange={(e) => edit(f, { model: e.target.value })} /></td>
              <td><input type="checkbox" aria-label={`Officer may switch for ${s.label}`} checked={s.officer_may_switch} onChange={(e) => edit(f, { officer_may_switch: e.target.checked })} /></td>
              <td><button type="button" aria-label={`Save ${s.label}`} onClick={() => save(f)}>Save</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
