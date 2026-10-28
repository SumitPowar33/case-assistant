import { useEffect, useState, type FormEvent } from 'react'
import { currentSession, get, send } from './api'
import { fmt, text } from './formats'
import { useLoad } from './useLoad'

type Account = {
  id: string; username: string | null; full_name: string; rank: string; role: string; station_id: string | null
  station_name: string | null; district: string | null; active: boolean; locked_until: string | null
}
type Station = { id: string; state_code: string; district: string; name: string; cctns_code: string | null }
type StatePack = { code: string; name: string; status: string }
type SignIn = { username_tried: string; outcome: string; client_ip: string | null; at: string }
type AdminAction = { action: string; reason: string | null; detail: string | null; at: string; actor_name: string; username: string | null; user_name: string | null; station_name: string | null }

const ROLES: Record<string, string> = {
  io: 'Investigating officer', front_desk: 'Front desk', sho: 'SHO', sp: 'SP', malkhana: 'Malkhana (evidence store)',
  prosecutor: 'Prosecutor', state_admin: 'State admin',
}
/** Roles whose case access follows their police station (same list as the core app). */
const STATION_ROLES = ['io', 'front_desk', 'sho', 'sp', 'malkhana']
const OUTCOMES: Record<string, string> = {
  ok: 'signed in', wrong_password: 'wrong password', locked: 'refused: locked', password_changed: 'changed password',
  wrong_current_password: 'wrong current password', unlocked_by_admin: 'unlocked by the state admin',
}
const ACTIONS: Record<string, string> = {
  user_created: 'Account created', user_disabled: 'Account disabled', user_enabled: 'Account enabled',
  user_unlocked: 'Account unlocked', user_changed: 'Account changed', station_created: 'Station added',
}

/** The state admin's page: accounts, stations, the sign-in log and the admin log. The server refuses anyone else. */
export default function AdminPage() {
  const [accounts, setAccounts] = useState<Account[]>()
  const [stations, setStations] = useState<Station[]>([])
  const [packs, setPacks] = useState<StatePack[]>([])
  const [actions, setActions] = useState<AdminAction[]>([])
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([get<Account[]>('/users'), get<Station[]>('/stations'), get<StatePack[]>('/state-packs'), get<AdminAction[]>('/admin-actions')])
      .then(([a, s, p, l]) => { if (live) { setAccounts(a); setStations(s); setPacks(p); setActions(l) } }, (e: Error) => live && setError(e.message))
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

  function createUser(f: FormData) {
    if (f.get('password') !== f.get('repeat')) throw new Error('The two passwords are not the same.')
    const role = String(f.get('role'))
    const stationId = text(f, 'station')
    if (STATION_ROLES.includes(role) && !stationId) throw new Error('Choose the police station for this role.')
    return send('/users', 'POST', {
      username: String(f.get('username')).trim().toLowerCase(), password: f.get('password'), fullName: text(f, 'fullName'),
      rank: text(f, 'rank'), role, stationId: STATION_ROLES.includes(role) || role === 'prosecutor' ? stationId : null,
    })
  }

  /** A transfer or promotion: new role, rank or station, with a reason. The officer must sign in again. */
  async function changeAccount(a: Account, f: FormData) {
    const role = String(f.get('role'))
    const stationId = text(f, 'station')
    if (STATION_ROLES.includes(role) && !stationId) throw new Error('Choose the police station for this role.')
    const r = await send<{ changed: string; firsAsIo: number }>(`/users/${a.id}`, 'PUT', {
      role, rank: text(f, 'rank'), stationId: STATION_ROLES.includes(role) || role === 'prosecutor' ? stationId : null, reason: f.get('reason'),
    })
    return `${a.full_name}: ${r!.changed}. They must sign in again.`
      + (r!.firsAsIo ? ` They are still the IO of ${r!.firsAsIo} FIR${r!.firsAsIo === 1 ? '' : 's'}; give those cases to another officer.` : '')
  }

  if (!accounts) return <section><h1>State admin</h1>{error ? <p role="alert">{error}</p> : <p>Loading…</p>}</section>
  return (
    <section>
      <h1>State admin</h1>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}

      <h2>Accounts</h2>
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Station</th><th>Status</th><th>Change</th></tr></thead>
        <tbody>{accounts.map((a) => (
          <tr key={a.id}>
            <td>{a.full_name} ({a.rank})</td><td>{a.username ?? <em>cannot sign in</em>}</td><td>{ROLES[a.role] ?? a.role}</td>
            <td>{a.station_name ? `${a.station_name}, ${a.district}` : '—'}</td>
            <td>{!a.active ? 'Disabled' : a.locked_until ? `Locked until ${fmt(a.locked_until)}` : 'Active'}</td>
            <td>
              {a.id === currentSession()?.user.id ? <em>you</em> : a.active
                ? <WithReason label="Disable" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/disable`, 'POST', { reason: f.get('reason') }), `${a.full_name} is disabled. Their sign-ins have ended.`)} />
                : <WithReason label="Enable" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/enable`, 'POST', { reason: f.get('reason') }), `${a.full_name} is enabled and must sign in again.`)} />}
              {a.id !== currentSession()?.user.id && (
                <details className="inline">
                  <summary>Change<span className="visually-hidden"> {a.full_name}</span></summary>
                  <form className="record-form" onSubmit={(e) => act(e, (f) => changeAccount(a, f))}>
                    <label>New role for {a.full_name} <select name="role" defaultValue={a.role}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label>Rank <input name="rank" required maxLength={60} defaultValue={a.rank} /></label>
                    <label>Police station <select name="station" defaultValue={a.station_id ?? ''}><option value="">— none —</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.district} ({s.state_code})</option>)}</select></label>
                    <label>Reason (for example the transfer order) <input name="reason" minLength={10} maxLength={2000} required /></label>
                    <button type="submit">Change {a.full_name}</button>
                  </form>
                </details>)}
              {a.active && a.locked_until && <WithReason label="Unlock" who={a.full_name} onSubmit={(e) => act(e, (f) => send(`/users/${a.id}/unlock`, 'POST', { reason: f.get('reason') }), `${a.full_name} is unlocked.`)} />}
            </td>
          </tr>))}
        </tbody>
      </table>

      <details>
        <summary>Add an account</summary>
        <form className="record-form" onSubmit={(e) => act(e, createUser, 'Account created. Give the officer the password in person; they should change it at first sign-in.')}>
          <label>Full name <input name="fullName" required maxLength={200} /></label>
          <label>Rank <input name="rank" required maxLength={60} placeholder="SI, PSI, Inspector…" /></label>
          <label>Role <select name="role" required defaultValue="io">{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Police station (needed for station roles; an SP sees the station's district)
            <select name="station" defaultValue=""><option value="">— none —</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.district} ({s.state_code})</option>)}</select>
          </label>
          <label>Username (3–40 small letters, digits, . _ -) <input name="username" required pattern="[a-z0-9._\-]{3,40}" autoComplete="off" /></label>
          <label>First password (at least 12 characters) <input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <label>First password again <input name="repeat" type="password" required minLength={12} autoComplete="new-password" /></label>
          <button type="submit">Create account</button>
        </form>
      </details>

      <h2>Police stations</h2>
      {stations.length === 0 ? <p>None yet.</p> : (
        <table>
          <thead><tr><th>Station</th><th>District</th><th>State</th><th>CCTNS code</th></tr></thead>
          <tbody>{stations.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.district}</td><td>{s.state_code}</td><td>{s.cctns_code ?? '—'}</td></tr>)}</tbody>
        </table>)}
      <details>
        <summary>Add a police station</summary>
        {packs.length === 0 ? <p>No state pack is loaded yet, so no station can be added.</p> : (
          <form className="record-form" onSubmit={(e) => act(e, (f) => send('/stations', 'POST', {
            stateCode: f.get('state'), district: text(f, 'district'), name: text(f, 'name'), cctnsCode: text(f, 'cctns') }), 'Station added.')}>
            <label>State <select name="state" required>{packs.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}</select></label>
            <label>District <input name="district" required maxLength={120} /></label>
            <label>Station name <input name="name" required maxLength={200} /></label>
            <label>CCTNS code (if known) <input name="cctns" maxLength={40} /></label>
            <button type="submit">Add station</button>
          </form>)}
      </details>

      <RoleList />

      <SignInLog version={version} />

      <h2>Admin log</h2>
      {actions.length === 0 ? <p>Nothing yet.</p> : (
        <ul>{actions.map((l, n) => (
          <li key={n}>{fmt(l.at)}: {ACTIONS[l.action] ?? l.action}{l.user_name ? `: ${l.user_name}${l.username ? ` (${l.username})` : ''}` : ''}
            {l.station_name ? `: ${l.station_name}` : ''}{l.detail ? ` (${l.detail})` : ''} by {l.actor_name}{l.reason ? `. Reason: “${l.reason}”` : ''}</li>))}
        </ul>)}
    </section>
  )
}

/** A change to an account that needs a written reason (10+ characters); it goes in the admin log. */
function WithReason({ label, who, onSubmit }: { label: string; who: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return (
    <details className="inline">
      <summary>{label}<span className="visually-hidden"> {who}</span></summary>
      <form className="inline" onSubmit={onSubmit}>
        <label>Reason to {label.toLowerCase()} {who}{' '}<input name="reason" minLength={10} maxLength={2000} required /></label>{' '}
        <button type="submit">{label} {who}</button>
      </form>
    </details>
  )
}

/** The latest 200 sign-in attempts, or those for one username. Passwords are never recorded. */
function SignInLog({ version }: { version: number }) {
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
      <h2>Sign-in log</h2>
      <form onSubmit={(e) => { e.preventDefault(); setFilter(String(new FormData(e.currentTarget).get('username')).trim()) }}>
        <label>Username{' '}<input name="username" /></label>{' '}<button type="submit">Show</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {rows && (rows.length === 0 ? <p>No sign-in attempts.</p> : (
        <table>
          <thead><tr><th>When</th><th>Username tried</th><th>Result</th><th>From</th></tr></thead>
          <tbody>{rows.map((r, n) => <tr key={n}><td>{fmt(r.at)}</td><td>{r.username_tried}</td><td>{OUTCOMES[r.outcome] ?? r.outcome}</td><td>{r.client_ip ?? '—'}</td></tr>)}</tbody>
        </table>))}
    </>
  )
}

/** The roles from the packs and what each may do (read only; packs change roles, not this screen). */
function RoleList() {
  const { data: roles, error } = useLoad<{ code: string; label: string; station_required: boolean; permissions: string[] }[]>('/roles')
  return (
    <>
      <h2>Roles and permissions</h2>
      {error ? <p role="alert">{error}</p> : !roles ? <p>Loading…</p> : (
        <table>
          <thead><tr><th scope="col">Role</th><th scope="col">Needs a station</th><th scope="col">Permissions</th></tr></thead>
          <tbody>{roles.map((r) => <tr key={r.code}><th scope="row">{r.label}</th><td>{r.station_required ? 'Yes' : 'No'}</td><td>{r.permissions.join(', ') || '—'}</td></tr>)}</tbody>
        </table>)}
    </>
  )
}
