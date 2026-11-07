import { useState } from 'react'
import { send } from './api'
import { fmt, istIso, lengthSeconds } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Memo = {
  id: string; place: string; grounds: string; started_at: string; ended_at: string; no_witness_reason: string | null; recorded_by_name: string
  forwarded_on: string | null; forwarded_to: string | null; days_since: number
  witnesses: { name: string; address: string }[]
  recordings: { sha256: string; seconds: number; esakshya_id: string | null }[]
  items: { id: string; label: string; description: string; kind: string; seal_no: string | null }[]
}

const KINDS = ['physical', 'electronic', 'document'] as const
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const short = (sha: string) => `${sha.slice(0, 4)}…${sha.slice(-4)}`

/** BNSS 105: the day the recording went to the Magistrate, once per memo. */
function Forward({ firId, memo, onSaved }: { firId: string; memo: Memo; onSaved: () => void }) {
  const t = useT()
  const [error, setError] = useState('')
  if (memo.forwarded_on) return <p><span className="chip c-ok">{t('search.forwarded', { to: memo.forwarded_to ?? '', date: memo.forwarded_on })}</span></p>
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const f = new FormData(e.currentTarget)
    try {
      await send(`/firs/${firId}/searches/${memo.id}/forwarded`, 'POST', { date: String(f.get('date')), to: String(f.get('to') ?? '').trim() })
      onSaved()
    } catch (err) { setError((err as Error).message) }
  }
  return (
    <>
      <p><span className="chip c-warn">{t('search.notForwarded', { days: memo.days_since })}</span></p>
      <form className="record-form" onSubmit={(e) => void save(e)} aria-label={t('search.forwardSave')}>
        <label>{t('search.forwardDate')} <input name="date" type="date" required /></label>
        <label>{t('search.forwardTo')} <input name="to" required minLength={3} maxLength={160} /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">{t('search.forwardSave')}</button>
      </form>
    </>
  )
}

/**
 * Search and seizure memo (design board 7, V48), sized for a tablet: written once the search is over, sent in one
 * request and frozen. Two witness rows and one recording row to start; empty rows are left out. Nothing is kept on the
 * device (online only, decision 1 of 2 Nov 2026). The board's photos, selfie and offline sync are not built.
 */
export default function Search({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const t = useT()
  const [version, setVersion] = useState(0)
  const [rows, setRows] = useState({ witnesses: 2, recordings: 1, items: 0 })
  const [error, setError] = useState('')
  const { data, error: loadError } = useLoad<Memo[]>(`/firs/${firId}/searches`, version)
  const memos = Array.isArray(data) ? data : []
  const saved = () => { setVersion((v) => v + 1); onSaved() }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget, f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    const range = (n: number) => Array.from({ length: n }, (_, i) => i)
    try {
      const recordings = range(rows.recordings).filter((i) => v(`r${i}sha`) || v(`r${i}len`)).map((i) => {
        const seconds = lengthSeconds(v(`r${i}len`))
        if (seconds === null) throw new Error(t('search.badLength'))
        if (!/^[0-9a-fA-F]{64}$/.test(v(`r${i}sha`))) throw new Error(t('search.badSha'))
        return { sha256: v(`r${i}sha`), seconds, esakshyaId: v(`r${i}es`) || null }
      })
      await send(`/firs/${firId}/searches`, 'POST', {
        place: v('place'), grounds: v('grounds'), startedAt: istIso(v('started')), endedAt: istIso(v('ended')),
        noWitnessReason: v('reason') || null,
        witnesses: range(rows.witnesses).filter((i) => v(`w${i}name`) || v(`w${i}address`)).map((i) => ({ name: v(`w${i}name`), address: v(`w${i}address`) })),
        recordings,
        items: range(rows.items).filter((i) => v(`i${i}label`)).map((i) => ({
          label: v(`i${i}label`), description: v(`i${i}description`), kind: v(`i${i}kind`), sealNo: v(`i${i}seal`) || null, sha256: v(`i${i}sha`) || null,
        })),
      })
      form.reset()
      setRows({ witnesses: 2, recordings: 1, items: 0 })
      saved()
    } catch (err) { setError((err as Error).message) }
  }
  const more = (k: keyof typeof rows) => setRows((r) => ({ ...r, [k]: r[k] + 1 }))
  return (
    <div className="two-col">
      <section aria-labelledby="search-title">
        <h2 id="search-title">{t('search.title')}</h2>
        <p className="note">{t('search.lede')}</p>
        <form className="record-form" onSubmit={(e) => void save(e)}>
          <h3>{t('search.new')}</h3>
          <label>{t('search.place')} <input name="place" required minLength={3} maxLength={300} /></label>
          <label>{t('search.grounds')} <textarea name="grounds" required minLength={10} maxLength={2000} /></label>
          <label>{t('search.started')} <input name="started" type="datetime-local" required /></label>
          <label>{t('search.ended')} <input name="ended" type="datetime-local" required /></label>
          <h4>{t('search.witnesses')}</h4>
          {Array.from({ length: rows.witnesses }, (_, i) => (
            <fieldset key={i}><legend>{t('search.witness', { n: i + 1 })}</legend>
              <label>{t('search.name')} <input name={`w${i}name`} maxLength={160} /></label>
              <label>{t('personForm.address')} <input name={`w${i}address`} maxLength={300} /></label>
            </fieldset>
          ))}
          <button type="button" className="btn" onClick={() => more('witnesses')}>{t('search.addWitness')}</button>
          <label>{t('search.noWitnessReason')} <input name="reason" maxLength={1000} /></label>
          <h4>{t('search.recordings')}</h4>
          {Array.from({ length: rows.recordings }, (_, i) => (
            <fieldset key={i}><legend>{t('search.recording', { n: i + 1 })}</legend>
              <label>{t('search.length')} <input name={`r${i}len`} inputMode="numeric" placeholder="3:41" /></label>
              <label>{t('search.sha')} <input name={`r${i}sha`} spellCheck={false} /></label>
              <label>{t('evForm.esakshya')} <input name={`r${i}es`} maxLength={60} /></label>
            </fieldset>
          ))}
          <button type="button" className="btn" onClick={() => more('recordings')}>{t('search.addRecording')}</button>
          <h4>{t('search.items')}</h4>
          {Array.from({ length: rows.items }, (_, i) => (
            <fieldset key={i}><legend>{t('search.item', { n: i + 1 })}</legend>
              <label>{t('common.label')} <input name={`i${i}label`} maxLength={40} placeholder="E-01" /></label>
              <label>{t('evForm.description')} <input name={`i${i}description`} maxLength={500} /></label>
              <label>{t('common.kind')} <select name={`i${i}kind`}>{KINDS.map((k) => <option key={k} value={k}>{t.code('evidenceKind', k)}</option>)}</select></label>
              <label>{t('evForm.seal')} <input name={`i${i}seal`} maxLength={60} /></label>
              <label>{t('evForm.sha')} <input name={`i${i}sha`} spellCheck={false} /></label>
            </fieldset>
          ))}
          <button type="button" className="btn" onClick={() => more('items')}>{t('search.addItem')}</button>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('search.freeze')}</button>
        </form>
      </section>
      <section aria-labelledby="search-list">
        <h2 id="search-list">{t('search.part')}</h2>
        {loadError ? <p role="alert">{loadError}</p> : !data ? <p>{t('common.loading')}</p> : memos.length === 0 ? <p>{t('search.none')}</p> : (
          <ul className="plain">{memos.map((m) => (
            <li key={m.id} className="card">
              <strong>{m.place}</strong>
              <p className="note">{t('search.meta', { start: fmt(m.started_at), end: fmt(m.ended_at), name: m.recorded_by_name })}</p>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.grounds}</p>
              <p>{m.witnesses.length > 0 && t('search.witnessList', { names: m.witnesses.map((w) => w.name).join(', ') })}
                {m.no_witness_reason && <> <span className="note">{t('search.noWitnesses', { reason: m.no_witness_reason })}</span></>}</p>
              <ul>{m.recordings.map((r) => (
                <li key={r.sha256}>{t('search.recordingLine', { length: mmss(r.seconds) })} · <code title={r.sha256}>{short(r.sha256)}</code>{r.esakshya_id && ` · ${r.esakshya_id}`}</li>
              ))}</ul>
              {m.items.length > 0 && <ul>{m.items.map((i) => (
                <li key={i.id}><strong>{i.label}</strong> {i.description} ({t.code('evidenceKind', i.kind)}){i.seal_no && ` · ${i.seal_no}`}</li>
              ))}</ul>}
              <Forward firId={firId} memo={m} onSaved={saved} />
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  )
}
