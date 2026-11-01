import { useEffect, useState } from 'react'
import { ai } from './api'
import { useT } from './i18n'

type Setting = { label: string; provider: string; model: string; officer_may_switch: boolean }
type Features = { providers: string[]; default_models: Record<string, string> }

/** Admin screen: which AI provider and model each feature uses, and whether officers may switch. Every save is audit-logged by the gateway. */
export default function SettingsPage() {
  const t = useT()
  const [settings, setSettings] = useState<Record<string, Setting>>()
  const [features, setFeatures] = useState<Features>()
  const [chainOk, setChainOk] = useState<boolean>()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    Promise.all([ai<Record<string, Setting>>('/v1/settings'), ai<Features>('/v1/features'), ai<{ chain_ok: boolean }>('/v1/audit?limit=1')])
      .then(([s, f, a]) => { setSettings(s); setFeatures(f); setChainOk(a.chain_ok) }, (e: Error) => setError(e.message))
  }, [])

  // the gateway's label is English; the screen catalogs name each feature (aiFeature.<id>), else the gateway's label shows
  const name = (feature: string) => { const x = t.code('aiFeature', feature); return x === feature ? settings?.[feature]?.label ?? feature : x }

  if (error && !settings) return <p role="alert">{error}</p>
  if (!settings || !features) return <p>{t('common.loading')}</p>

  const edit = (feature: string, change: Partial<Setting>) =>
    setSettings((cur) => cur && { ...cur, [feature]: { ...cur[feature], ...change } })
  async function save(feature: string) {
    const s = settings![feature]
    setError(''); setSaved('')
    try {
      const out = await ai<Setting>(`/v1/settings/${feature}`, {
        method: 'PUT', body: { provider: s.provider, model: s.model || null, officer_may_switch: s.officer_may_switch },
      })
      edit(feature, out)
      setSaved(t('settings.saved', { feature: name(feature), provider: out.provider, model: out.model }))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h1>{t('nav.settings')}</h1>
      <p>{t('settings.intro')}{' '}{chainOk ? t('settings.chainOk') : <strong>{t('settings.chainBroken')}</strong>}</p>
      <p><small>{t('settings.onlyAdmin')}</small></p>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">{saved}</p>
      <table>
        <caption>{t('settings.caption')}</caption>
        <thead><tr><th scope="col">{t('settings.colFeature')}</th><th scope="col">{t('settings.colProvider')}</th><th scope="col">{t('settings.colModel')}</th><th scope="col">{t('settings.colSwitch')}</th><th scope="col"><span className="visually-hidden">{t('form.save')}</span></th></tr></thead>
        <tbody>
          {Object.entries(settings).map(([f, s]) => (
            <tr key={f}>
              <th scope="row">{name(f)}</th>
              <td>
                <select aria-label={t('settings.providerFor', { feature: name(f) })} value={s.provider} onChange={(e) => edit(f, { provider: e.target.value, model: '' })}>
                  {features.providers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </td>
              <td><input aria-label={t('settings.modelFor', { feature: name(f) })} value={s.model} placeholder={features.default_models[s.provider]} onChange={(e) => edit(f, { model: e.target.value })} /></td>
              <td><input type="checkbox" aria-label={t('settings.switchFor', { feature: name(f) })} checked={s.officer_may_switch} onChange={(e) => edit(f, { officer_may_switch: e.target.checked })} /></td>
              <td><button type="button" aria-label={t('settings.saveFor', { feature: name(f) })} onClick={() => save(f)}>{t('form.save')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
