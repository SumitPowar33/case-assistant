import { useEffect, useState, type FormEvent } from 'react'
import { currentSession, get, getText, send } from './api'
import { fmt, text } from './formats'
import { useT } from './i18n'

type Station = { id: string; state_code?: string; district: string; name: string }
type Profile = { id: string; label: string; entity: string; module?: string; fields: { name: string; required: boolean }[] }
type Inspect = { headers: string[]; suggested: Record<string, string>; required: string[]; rows: number }
type Batch = {
  id: string; entity: string; station_name: string; filename: string; status: string; rows_total: number; rows_ok: number; rows_warning: number
  rows_error: number; rows_duplicate: number; rows_imported: number | null; created_at: string; created_by_name: string
  approved_by_name: string | null; authority_note: string | null; undo_reason: string | null
}
type Row = { row_no: number; status: string; messages: { level: string; field: string; text: string }[]; raw: Record<string, string> | null }

/**
 * Loading existing FIRs, then their arrests, chargesheets, evidence and notices, from CSV files, in deliberate steps: choose the file and match its columns, read the checked
 * result, approve it with the authority for the load. Nothing reaches the cases before the approval, and an
 * imported batch can be undone until work is recorded on it. The server decides who may do this.
 */
export default function ImportPage() {
  const t = useT()
  const status = (code: string) => t.code('import.status', code)
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
  const [stationId, setStationId] = useState('')

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
    if (!chosen?.size) { setError(t('import.chooseCsv')); return }
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
    await run(async () => setBatch((await send<Batch>(`/imports/${batch.id}/commit`, 'POST', { authority }))!), t('import.loaded'))
  }

  async function undo(e: FormEvent<HTMLFormElement>, b: Batch) {
    e.preventDefault()
    const reason = text(new FormData(e.currentTarget), 'reason')
    await run(async () => { await send(`/imports/${b.id}/undo`, 'POST', { reason }); setBatch(undefined) }, t('import.undone', { things: things(b) }))
  }

  const profile = profiles.find((p) => p.id === file?.form.profile)
  const station = stations.find((s) => s.id === (stationId || currentSession()?.user.station_id)) ?? stations[0]   // own station first
  // national layouts fit every station; a state module's layout only that state's stations (the server checks it too)
  const layouts = profiles.filter((p) => !p.module || p.module === 'IN' || p.module === station?.state_code)
  const importable = batch ? batch.rows_ok + batch.rows_warning : 0
  const things = (b: Batch) => t.code('import.things', b.entity)
  return (
    <section aria-labelledby="import-h">
      <h2 id="import-h">{t('import.title')}</h2>
      <p>{t('import.intro')}</p>
      {error && <p role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}

      <form onSubmit={readFile} aria-label={t('import.step1')}>
        <h3>1. {t('import.step1')}</h3>
        <label>{t('common.policeStation')} <select name="station" required value={station?.id ?? ''} onChange={(e) => setStationId(e.target.value)}>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.district})</option>)}</select></label>{' '}
        <label>{t('import.layout')} <select name="profile">{layouts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>{' '}
        <label>{t('import.language')} <input name="language" defaultValue="en" size={5} pattern="[a-z]{2,3}(-[A-Za-z]{2,4})?" required /></label>{' '}
        <label>{t('import.csvFile')} <input name="file" type="file" accept=".csv,text/csv" /></label>{' '}
        <button type="submit">{t('import.read')}</button>
      </form>

      {inspect && profile && (
        <form onSubmit={(e) => { e.preventDefault(); void check() }} aria-label={t('import.step2')}>
          <h3>2. {t('import.step2')}</h3>
          <p>{t('import.matched', { rows: inspect.rows })}</p>
          <table><tbody>{profile.fields.map((f) => (
            <tr key={f.name}><th scope="row"><label htmlFor={`map-${f.name}`}>{f.name}{f.required && ' *'}</label></th>
              <td><select id={`map-${f.name}`} value={mapping[f.name] ?? ''} onChange={(e) => setMapping((m) => {
                const next = { ...m }; if (e.target.value) next[f.name] = e.target.value; else delete next[f.name]; return next
              })}><option value="">{t('import.notInFile')}</option>{inspect.headers.map((h) => <option key={h}>{h}</option>)}</select></td></tr>
          ))}</tbody></table>
          <button type="submit">{t('import.check')}</button>
        </form>
      )}

      {batch && (
        <div aria-label={t('import.result')}>
          <h3>3. {t('import.resultFor', { file: batch.filename })}</h3>
          <p>{t('import.summary', { status: status(batch.status), total: batch.rows_total, ok: batch.rows_ok, warning: batch.rows_warning, error: batch.rows_error, duplicate: batch.rows_duplicate })}</p>
          <p>
            {['', 'ok', 'warning', 'error', 'duplicate'].map((s) => (
              <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s ? status(s) : t('import.allRows')}</button>
            ))}{' '}
            <button type="button" onClick={() => void download()}>{t('import.download')}</button>
          </p>
          <table><thead><tr><th>{t('import.colRow')}</th><th>{t('import.result')}</th><th>{t('import.colValues')}</th><th>{t('import.colProblems')}</th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.row_no}><td>{r.row_no}</td><td>{status(r.status === 'imported' ? 'imported_row' : r.status)}</td>
                <td>{r.raw ? Object.values(r.raw).slice(0, 4).join(' · ') : t('import.removed')}</td>
                <td>{r.messages.map((m, i) => <div key={i}>{t.code('import.msg', m.level === 'info' || m.level === 'warning' ? m.level : 'error')}: {m.text}</div>)}</td></tr>
            ))}
          </tbody></table>
          {batch.status === 'staged' && (
            <form onSubmit={(e) => void approve(e)} aria-label={t('import.step4')}>
              <h3>4. {t('import.step4')}</h3>
              <p>{t('import.approveText', { n: importable, things: things(batch) })}</p>
              <label>{t('import.authority')} <input name="authority" minLength={10} maxLength={500} size={50} required /></label>{' '}
              <button type="submit" disabled={importable === 0}>{t('import.approveButton', { n: importable, things: things(batch) })}</button>{' '}
              <button type="button" onClick={() => void run(async () => setBatch((await send<Batch>(`/imports/${batch.id}/discard`, 'POST', {}))!), t('import.discarded'))}>{t('import.discard')}</button>
            </form>
          )}
          {batch.status === 'imported' && <p>{t('import.loadedLine', { n: batch.rows_imported!, things: things(batch), by: batch.approved_by_name!, authority: batch.authority_note! })}</p>}
        </div>
      )}

      <h3>{t('import.earlier')}</h3>
      {history.length === 0 ? <p>{t('import.none')}</p> : (
        <table><thead><tr><th>{t('import.colFile')}</th><th>{t('import.colStation')}</th><th>{t('import.colStatus')}</th><th>{t('import.colRows')}</th><th>{t('import.colStagedBy')}</th><th /></tr></thead><tbody>
          {history.map((b) => (
            <tr key={b.id}><td>{b.filename}<br /><small>{fmt(b.created_at)}</small></td><td>{b.station_name}</td><td>{status(b.status)}</td>
              <td>{b.rows_imported ?? b.rows_total}</td><td>{b.created_by_name}</td>
              <td><button type="button" onClick={() => open(b)}>{t('import.open', { file: b.filename })}</button>
                {b.status === 'imported' && (
                  <form onSubmit={(e) => void undo(e, b)} aria-label={t('import.undo', { file: b.filename })}>
                    <label>{t('import.undoReason', { file: b.filename })} <input name="reason" minLength={10} maxLength={2000} required /></label>{' '}
                    <button type="submit">{t('import.undo', { file: b.filename })}</button>
                  </form>)}</td></tr>
          ))}
        </tbody></table>
      )}
    </section>
  )
}
