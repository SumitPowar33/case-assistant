import { useEffect, useState, type FormEvent } from 'react'
import { get, getText, send } from './api'
import { fmt, text } from './formats'

type Station = { id: string; district: string; name: string }
type Profile = { id: string; label: string; fields: { name: string; required: boolean }[] }
type Inspect = { headers: string[]; suggested: Record<string, string>; required: string[]; rows: number }
type Batch = {
  id: string; station_name: string; filename: string; status: string; rows_total: number; rows_ok: number; rows_warning: number
  rows_error: number; rows_duplicate: number; rows_imported: number | null; created_at: string; created_by_name: string
  approved_by_name: string | null; authority_note: string | null; undo_reason: string | null
}
type Row = { row_no: number; status: string; messages: { level: string; field: string; text: string }[]; raw: Record<string, string> | null }

const STATUS: Record<string, string> = {
  staged: 'Waiting for approval', imported: 'Imported', undone: 'Undone', discarded: 'Discarded',
  ok: 'Ready', warning: 'Ready, check', error: 'Will be skipped: error', duplicate: 'Skipped: already there', imported_row: 'Imported', skipped: 'Skipped',
}

/**
 * Loading existing FIRs from a CSV file, in deliberate steps: choose the file and match its columns, read the checked
 * result, approve it with the authority for the load. Nothing reaches the cases before the approval, and an
 * imported batch can be undone until work is recorded on it. The server decides who may do this.
 */
export default function ImportPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [history, setHistory] = useState<Batch[]>([])
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [file, setFile] = useState<{ name: string; csv: string; form: { stationId: string; profile: string; language: string } }>()
  const [inspect, setInspect] = useState<Inspect>()
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [batch, setBatch] = useState<Batch>()
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([get<Station[]>('/stations'), get<Profile[]>('/imports/profiles'), get<Batch[]>('/imports')])
      .then(([s, p, h]) => { if (live) { setStations(s); setProfiles(p); setHistory(h) } }, (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [version])

  useEffect(() => {
    if (!batch) return
    let live = true
    get<Row[]>(`/imports/${batch.id}/rows${filter ? `?status=${filter}` : ''}`).then((r) => live && setRows(r), (e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [batch, filter])

  async function run(job: () => Promise<unknown>, message: string) {
    setError(''); setDone('')
    try { await job(); setDone(message); setVersion((v) => v + 1) } catch (err) { setError((err as Error).message) }
  }

  async function readFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const chosen = (e.currentTarget.elements.namedItem('file') as HTMLInputElement).files?.[0]
    if (!chosen?.size) { setError('Choose a CSV file.'); return }
    const form = { stationId: String(f.get('station')), profile: String(f.get('profile')), language: String(f.get('language')).trim() }
    setError(''); setDone(''); setBatch(undefined)
    try {
      const csv = await chosen.text()
      const info = await send<Inspect>('/imports/inspect', 'POST', { profile: form.profile, csv })
      setFile({ name: chosen.name, csv, form }); setInspect(info!); setMapping(info!.suggested)
    } catch (err) { setError((err as Error).message) }
  }

  async function check() {
    if (!file) return
    setError(''); setDone('')
    try {
      const b = await send<Batch>('/imports', 'POST', {
        stationId: file.form.stationId, profile: file.form.profile, complaintLanguage: file.form.language, filename: file.name, csv: file.csv, mapping,
      })
      setBatch(b!); setFilter(''); setInspect(undefined); setFile(undefined); setVersion((v) => v + 1)
    } catch (err) { setError((err as Error).message) }
  }

  function open(b: Batch) { setBatch(b); setFilter(''); setInspect(undefined); setFile(undefined) }

  async function download() {
    if (!batch) return
    try {
      const url = URL.createObjectURL(new Blob([await getText(`/imports/${batch.id}/errors.csv`)], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = 'import-problems.csv'; a.click(); URL.revokeObjectURL(url)
    } catch (err) { setError((err as Error).message) }
  }

  async function approve(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!batch) return
    const authority = text(new FormData(e.currentTarget), 'authority')
    await run(async () => setBatch((await send<Batch>(`/imports/${batch.id}/commit`, 'POST', { authority }))!), 'The records were loaded.')
  }

  async function undo(e: FormEvent<HTMLFormElement>, b: Batch) {
    e.preventDefault()
    const reason = text(new FormData(e.currentTarget), 'reason')
    await run(async () => { await send(`/imports/${b.id}/undo`, 'POST', { reason }); setBatch(undefined) }, 'The batch was undone and its FIRs removed.')
  }

  const profile = profiles.find((p) => p.id === file?.form.profile)
  const importable = batch ? batch.rows_ok + batch.rows_warning : 0
  return (
    <section aria-labelledby="import-h">
      <h2 id="import-h">Load existing records</h2>
      <p>Load FIRs from an old register or system as a CSV file. The file is checked row by row first and nothing is added to the cases until a person approves it.
        Existing FIRs are never changed. Use fictional data until your department has a data agreement.</p>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}

      <form onSubmit={readFile} aria-label="Choose the file">
        <h3>1. Choose the file</h3>
        <label>Police station <select name="station" required>{stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}</select></label>{' '}
        <label>File layout <select name="profile">{profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>{' '}
        <label>Language of the complaint text <input name="language" defaultValue="en" size={5} pattern="[a-z]{2,3}(-[A-Za-z]{2,4})?" required /></label>{' '}
        <label>CSV file <input name="file" type="file" accept=".csv,text/csv" /></label>{' '}
        <button type="submit">Read the file</button>
      </form>

      {inspect && profile && (
        <form onSubmit={(e) => { e.preventDefault(); void check() }} aria-label="Match the columns">
          <h3>2. Match the columns</h3>
          <p>{inspect.rows} rows. Columns were matched by name; change any that are wrong. Fields marked * are required.</p>
          <table><tbody>{profile.fields.map((f) => (
            <tr key={f.name}><th scope="row"><label htmlFor={`map-${f.name}`}>{f.name}{f.required && ' *'}</label></th>
              <td><select id={`map-${f.name}`} value={mapping[f.name] ?? ''} onChange={(e) => setMapping((m) => {
                const next = { ...m }; if (e.target.value) next[f.name] = e.target.value; else delete next[f.name]; return next
              })}><option value="">(not in the file)</option>{inspect.headers.map((h) => <option key={h}>{h}</option>)}</select></td></tr>
          ))}</tbody></table>
          <button type="submit">Check the file</button>
        </form>
      )}

      {batch && (
        <div aria-label="Result">
          <h3>3. Result for {batch.filename}</h3>
          <p>{STATUS[batch.status]}. {batch.rows_total} rows: {batch.rows_ok} ready, {batch.rows_warning} ready with something to check,
            {' '}{batch.rows_error} with errors (skipped), {batch.rows_duplicate} already in the system (skipped).</p>
          <p>
            {['', 'ok', 'warning', 'error', 'duplicate'].map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s ? STATUS[s] : 'All rows'}</button>
            ))}{' '}
            <button type="button" onClick={() => void download()}>Download the problems as CSV</button>
          </p>
          <table><thead><tr><th>Row</th><th>Result</th><th>Values</th><th>Problems</th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.row_no}><td>{r.row_no}</td><td>{STATUS[r.status === 'imported' ? 'imported_row' : r.status]}</td>
                <td>{r.raw ? Object.values(r.raw).slice(0, 4).join(' · ') : 'removed after loading'}</td>
                <td>{r.messages.map((m, i) => <div key={i}>{m.level === 'info' ? 'Note' : m.level === 'warning' ? 'Check' : 'Error'}: {m.text}</div>)}</td></tr>
            ))}
          </tbody></table>
          {batch.status === 'staged' && (
            <form onSubmit={(e) => void approve(e)} aria-label="Approve">
              <h3>4. Approve</h3>
              <p>{importable} rows will be added as new FIRs. Rows with errors and FIRs already there are skipped. Personal details stay in the system only once approved;
                the checking copy is erased.</p>
              <label>Authority for this load (order or letter, at least 10 characters) <input name="authority" minLength={10} maxLength={500} size={50} required /></label>{' '}
              <button type="submit" disabled={importable === 0}>Approve and load {importable} FIRs</button>{' '}
              <button type="button" onClick={() => void run(async () => setBatch((await send<Batch>(`/imports/${batch.id}/discard`, 'POST', {}))!), 'The batch was discarded.')}>Discard this batch</button>
            </form>
          )}
          {batch.status === 'imported' && <p>Loaded {batch.rows_imported} FIRs, approved by {batch.approved_by_name} on the authority “{batch.authority_note}”.</p>}
        </div>
      )}

      <h3>Earlier loads</h3>
      {history.length === 0 ? <p>No file has been loaded yet.</p> : (
        <table><thead><tr><th>File</th><th>Station</th><th>Status</th><th>Rows</th><th>Staged by</th><th /></tr></thead><tbody>
          {history.map((b) => (
            <tr key={b.id}><td>{b.filename}<br /><small>{fmt(b.created_at)}</small></td><td>{b.station_name}</td><td>{STATUS[b.status]}</td>
              <td>{b.rows_imported ?? b.rows_total}</td><td>{b.created_by_name}</td>
              <td><button type="button" onClick={() => open(b)}>Open {b.filename}</button>
                {b.status === 'imported' && (
                  <form onSubmit={(e) => void undo(e, b)} aria-label={`Undo ${b.filename}`}>
                    <label>Reason to undo {b.filename} <input name="reason" minLength={10} maxLength={2000} required /></label>{' '}
                    <button type="submit">Undo {b.filename}</button>
                  </form>)}</td></tr>
          ))}
        </tbody></table>
      )}
    </section>
  )
}
