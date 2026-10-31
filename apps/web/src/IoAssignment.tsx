import { currentSession, send } from './api'
import { Form } from './Forms'
import { fmt, text } from './formats'
import { useLoad } from './useLoad'

type Candidate = { id: string; full_name: string; rank: string; role: string }
type Assignment = { at: string; from_name: string | null; to_name: string; assigned_by_name: string; reason: string | null }

/** The SHO of the station or the SP of the district assigns the IO; a change of IO needs a reason. The server checks. */
function AssignForm({ firId, hasIo, onSaved }: { firId: string; hasIo: boolean; onSaved: () => void }) {
  const { data, error } = useLoad<Candidate[]>(`/firs/${firId}/io-candidates`)
  if (error) return <p role="alert">{error}</p>
  if (!data) return null
  return (
    <Form title={hasIo ? 'Give the case to another IO' : 'Assign the IO'} onSaved={onSaved}
      submit={(f) => {
        const reason = text(f, 'reason')
        if (hasIo && (reason ?? '').length < 10) throw new Error('Give the reason for changing the IO (at least 10 characters).')
        return send(`/firs/${firId}/io`, 'POST', { ioId: f.get('io'), reason })
      }}>
      <label>Officer <select name="io">{data.map((c) => <option key={c.id} value={c.id}>{c.full_name} ({c.rank})</option>)}</select></label>
      {hasIo && <label>Reason for the change <input name="reason" minLength={10} maxLength={2000} required /></label>}
    </Form>
  )
}

export default function IoAssignment({ firId, ioName, version, onSaved }: { firId: string; ioName: string | null; version: number; onSaved: () => void }) {
  const { data: history } = useLoad<Assignment[]>(`/firs/${firId}/io-history`, version)
  // a role that sees every case of its station or district assigns the IO (packs: case_scope), not a role name
  const scope = currentSession()?.user.case_scope
  const supervisor = scope === 'station' || scope === 'district'
  return (
    <>
      <p>Investigating officer: {ioName ?? <strong>not assigned yet</strong>}</p>
      {supervisor && <AssignForm key={version} firId={firId} hasIo={ioName !== null} onSaved={onSaved} />}
      {history && history.length > 0 && (
        <details>
          <summary>IO history</summary>
          <ul>{history.map((h, i) => (
            <li key={i}>{fmt(h.at)}: {h.from_name ? `${h.from_name} to ${h.to_name}` : `${h.to_name} assigned`} by {h.assigned_by_name}
              {h.reason ? `. Reason: “${h.reason}”` : ''}</li>))}
          </ul>
        </details>)}
    </>
  )
}
