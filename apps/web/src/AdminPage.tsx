import { useEffect, useState, type FormEvent } from 'react'
import { currentSession, get, send } from './api'
import { fmt, text } from './formats'
import { useT } from './i18n'

type Account = {
  id: string; username: string | null; full_name: string; rank: string; role: string; station_id: string | null
  station_name: string | null; district: string | null; active: boolean; locked_until: string | null
}
type Station = { id: string; state_code: string; district: string; name: string; cctns_code: string | null }
type StatePack = { code: string; name: string; status: string }
type SignIn = { username_tried: string; outcome: string; client_ip: string | null; at: string }
type AdminAction = { action: string; reason: string | null; detail: string | null; at: string; actor_name: string; username: string | null; user_name: string | null; station_name: string | null }

/** A role from the packs (the roles.json of each pack, via GET /api/roles): no role name is written into this screen. */
type Role = { code: string; label: string; station_required: boolean; permissions: string[] }

/** The state admin's page: accounts, stations, the sign-in log and the admin log. The server refuses anyone else. */
export default function AdminPage() {
  const t = useT()
  const [accounts, setAccounts] = useState<Account[]>()
  const [stations, setStations] = useState<Station[]>([])
  const [packs, setPacks] = useState<StatePack[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [actions, setActions] = useState<AdminAction[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([get<Account[]>('/users'), get<Station[]>('/stations'), get<StatePack[]>('/state-packs'), get<AdminAction[]>('/admin-actions'), get<Role[]>('/roles')])
      .then(([a, s, p, l, r]) => { if (live) { setAccounts(a); setStations(s); setPacks(p); setActions(l); setRoles(r) } }, (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [version])

  async function act(e: FormEvent<HTMLFormElement>, run: (f: FormData) => Promise<unknown>, message?: string) {
    e.preventDefault()
    setError(''); setDone('')
    const form = e.currentTarget
    try {
      const result = await run(new FormData(form))
      form.reset(); setDone(message ?? String(result)); setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }

  const label = (code: string) => roles.find((r) => r.code === code)?.label ?? code
  /** The chosen station is always sent (a state admin's station decides their state); the server checks it too. */
  function station(f: FormData, role: string) {
    const stationId = text(f, 'station')
    if (roles.find((r) => r.code === role)?.station_required && !stationId) throw new Error(t('admin.chooseStation'))
    return stationId
  }
  const roleOptions = roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)

  function createUser(f: FormData) {
    if (f.get('password') !== f.get('repeat')) throw new Error(t('admin.passwordsDiffer'))
    const role = String(f.get('role'))
    return send('/users', 'POST', {
      username: String(f.get('username')).trim().toLowerCase(), password: f.get('password'), fullName: text(f, 'fullName'),
      rank: text(f, 'rank'), role, stationId: station(f, role),
    })
  }

  /** A transfer or promotion: new role, rank or station, with a reason. The officer must sign in again. */
  async function changeAccount(a: Account, f: FormData) {
    const role = String(f.get('role'))
    const r = await send<{ changed: string; firsAsIo: number }>(`/users/${a.id}`, 'PUT', {
      role, rank: text(f, 'rank'), stationId: station(f, role), reason: f.get('reason'),
    })
    return t('admin.changed', { name: a.full_name, changed: r!.changed })   // what changed is written by the server
      + (r!.firsAsIo ? ` ${t(r!.firsAsIo === 1 ? 'admin.stillIo.one' : 'admin.stillIo.other', { n: r!.firsAsIo })}` : '')
  }

  if (!accounts) return <section><h1>{t('admin.title')}</h1>{error ? <p role="alert">{error}</p> : <p>{t('common.loading')}</p>}</section>
  return (
    <section>
      <h1>{t('admin.title')}</h1>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}

      <h2>{t('admin.accounts')}</h2>
      <table>
        <thead><tr><th>{t('admin.colName')}</th><th>{t('login.username')}</th><th>{t('admin.colRole')}</th><th>{t('import.colStation')}</th><th>{t('import.colStatus')}</th><th>{t('admin.colChange')}</th></tr></thead>
        <tbody>{accounts.map((a) => (
          <tr key={a.id}>
            <td>{a.full_name} ({a.rank})</td><td>{a.username ?? <em>{t('admin.cannotSignIn')}</em>}</td><td>{label(a.role)}</td>
            <td>{a.station_name ? `${a.station_name}, ${a.district}` : '—'}</td>
            <td>{!a.active ? t('admin.disabled') : a.locked_until ? t('admin.lockedUntil', { date: fmt(a.locked_until) }) : t('admin.active')}</td>
            <td>
              {a.id === currentSession()?.user.id ? <em>{t('admin.you')}</em> : a.active
                ? <WithReason kind="disable" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/disable`, 'POST', { reason: f.get('reason') }), t('admin.disabledMsg', { name: a.full_name }))} />
                : <WithReason kind="enable" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/enable`, 'POST', { reason: f.get('reason') }), t('admin.enabledMsg', { name: a.full_name }))} />}
              {a.id !== currentSession()?.user.id && (
                <details className="inline">
                  <summary>{t('admin.colChange')}<span className="visually-hidden"> {a.full_name}</span></summary>
                  <form className="record-form" onSubmit={(e) => act(e, (f) => changeAccount(a, f))}>
                    <label>{t('admin.newRoleFor', { name: a.full_name })} <select name="role" defaultValue={a.role}>{roleOptions}</select></label>
                    <label>{t('admin.rank')} <input name="rank" required maxLength={60} defaultValue={a.rank} /></label>
                    <label>{t('common.policeStation')} <select name="station" defaultValue={a.station_id ?? ''}><option value="">{t('admin.noneOption')}</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.district} ({s.state_code})</option>)}</select></label>
                    <label>{t('admin.changeReason')} <input name="reason" minLength={10} maxLength={2000} required /></label>
                    <button type="submit">{t('admin.changeWho', { name: a.full_name })}</button>
                  </form>
                </details>)}
              {a.active && a.locked_until && <WithReason kind="unlock" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/unlock`, 'POST', { reason: f.get('reason') }), t('admin.unlockedMsg', { name: a.full_name }))} />}
            </td>
          </tr>))}
        </tbody>
      </table>

      <details>
        <summary>{t('admin.addAccount')}</summary>
        <form className="record-form" onSubmit={(e) => act(e, createUser, t('admin.created'))}>
          <label>{t('admin.fullName')} <input name="fullName" required maxLength={200} /></label>
          <label>{t('admin.rank')} <input name="rank" required maxLength={60} placeholder="SI, PSI, Inspector…" /></label>
          <label>{t('admin.colRole')} <select name="role" required>{roleOptions}</select></label>
          <label>{t('admin.stationHelp')}
            <select name="station" defaultValue=""><option value="">{t('admin.noneOption')}</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.district} ({s.state_code})</option>)}</select>
          </label>
          <label>{t('admin.username')} <input name="username" required pattern="[a-z0-9._\-]{3,40}" autoComplete="off" /></label>
          <label>{t('admin.firstPassword')} <input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <label>{t('admin.firstPasswordAgain')} <input name="repeat" type="password" required minLength={12} autoComplete="new-password" /></label>
          <button type="submit">{t('admin.create')}</button>
        </form>
      </details>

      <h2>{t('admin.stations')}</h2>
      {stations.length === 0 ? <p>{t('common.noneYet')}</p> : (
        <table>
          <thead><tr><th>{t('import.colStation')}</th><th>{t('policies.optDistrict')}</th><th>{t('policies.optState')}</th><th>{t('admin.colCctns')}</th></tr></thead>
          <tbody>{stations.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.district}</td><td>{s.state_code}</td><td>{s.cctns_code ?? '—'}</td></tr>)}</tbody>
        </table>)}
      <details>
        <summary>{t('admin.addStation')}</summary>
        {packs.length === 0 ? <p>{t('admin.noPack')}</p> : (
          <form className="record-form" onSubmit={(e) => act(e, (f) => send('/stations', 'POST', {
            stateCode: f.get('state'), district: text(f, 'district'), name: text(f, 'name'), cctnsCode: text(f, 'cctns') }), t('admin.stationAdded'))}>
            <label>{t('policies.optState')} <select name="state" required>{packs.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}</select></label>
            <label>{t('policies.optDistrict')} <input name="district" required maxLength={120} /></label>
            <label>{t('admin.stationName')} <input name="name" required maxLength={200} /></label>
            <label>{t('admin.cctnsIfKnown')} <input name="cctns" maxLength={40} /></label>
            <button type="submit">{t('admin.addStationButton')}</button>
          </form>)}
      </details>

      <RoleList roles={roles} />

      <SignInLog version={version} />

      <h2>{t('admin.log')}</h2>
      {actions.length === 0 ? <p>{t('admin.nothingYet')}</p> : (
        <ul>{actions.map((l, n) => (
          <li key={n}>{t('admin.logBy', {
            what: `${fmt(l.at)}: ${t.code('admin.action', l.action)}${l.user_name ? `: ${l.user_name}${l.username ? ` (${l.username})` : ''}` : ''}`
              + `${l.station_name ? `: ${l.station_name}` : ''}${l.detail ? ` (${l.detail})` : ''}`,
            actor: l.actor_name })}{l.reason ? `. ${t('io.reasonShown', { reason: l.reason })}` : ''}</li>))}
        </ul>)}
    </section>
  )
}

/** A change to an account that needs a written reason (10+ characters); it goes in the admin log. */
function WithReason({ kind, who, onSubmit }: { kind: 'disable' | 'enable' | 'unlock'; who: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const t = useT()
  return (
    <details className="inline">
      <summary>{t(`admin.do.${kind}`)}<span className="visually-hidden"> {who}</span></summary>
      <form className="inline" onSubmit={onSubmit}>
        <label>{t(`admin.reasonTo.${kind}`, { who })}{' '}<input name="reason" minLength={10} maxLength={2000} required /></label>{' '}
        <button type="submit">{t(`admin.doWho.${kind}`, { who })}</button>
      </form>
    </details>
  )
}

/** The latest 200 sign-in attempts, or those for one username. Passwords are never recorded. */
function SignInLog({ version }: { version: number }) {
  const t = useT()
  const [filter, setFilter] = useState('')
  const [rows, setRows] = useState<SignIn[]>()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    get<SignIn[]>(`/sign-ins${filter ? `?username=${encodeURIComponent(filter)}` : ''}`)
      .then((r) => live && setRows(r), (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [filter, version])
  return (
    <>
      <h2>{t('admin.signIns')}</h2>
      <form onSubmit={(e) => { e.preventDefault(); setFilter(String(new FormData(e.currentTarget).get('username')).trim()) }}>
        <label>{t('login.username')}{' '}<input name="username" /></label>{' '}<button type="submit">{t('admin.show')}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {rows && (rows.length === 0 ? <p>{t('admin.noSignIns')}</p> : (
        <table>
          <thead><tr><th>{t('admin.colWhen')}</th><th>{t('admin.colTried')}</th><th>{t('import.result')}</th><th>{t('admin.colFrom')}</th></tr></thead>
          <tbody>{rows.map((r, n) => <tr key={n}><td>{fmt(r.at)}</td><td>{r.username_tried}</td><td>{t.code('admin.outcome', r.outcome)}</td><td>{r.client_ip ?? '—'}</td></tr>)}</tbody>
        </table>))}
    </>
  )
}

/** The roles from the packs and what each may do (read only; packs change roles, not this screen). */
function RoleList({ roles }: { roles: Role[] }) {
  const t = useT()
  return (
    <>
      <h2>{t('admin.roles')}</h2>
      <table>
          <thead><tr><th scope="col">{t('admin.colRole')}</th><th scope="col">{t('admin.colNeedsStation')}</th><th scope="col">{t('admin.colPermissions')}</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.code}><th scope="row">{r.label}</th><td>{t(r.station_required ? 'admin.yes' : 'admin.no')}</td><td>{r.permissions.join(', ') || '—'}</td></tr>)}</tbody>
      </table>
    </>
  )
}
