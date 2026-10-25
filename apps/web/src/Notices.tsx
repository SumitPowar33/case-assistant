import { useState } from 'react'
import { send } from './api'
import { Form } from './Forms'
import TypingField from './TypingField'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'

type Notice = {
  id: string; kind: string; addressee: string; items_requested: string[]; items_missing: string[]; status: string
  issued_at: string | null; reply_due_on: string | null; signed_by_name: string | null; replies: number
}

const KINDS: Record<string, string> = {
  BNSS_94: 'BNSS 94: produce documents or data', BNSS_35_3: 'BNSS 35(3): appear before the officer',
  BNSS_179: 'BNSS 179: attend as a witness', follow_up: 'Follow-up',
}
const STATUS: Record<string, string> = {
  draft: 'draft (not signed)', sent: 'sent, waiting for reply', reply_incomplete: 'reply incomplete', complete: 'complete', cancelled: 'cancelled',
}
/** The check used for a notice that asked for no list of items. */
const FULL_REPLY = 'Reply answers the notice fully'
const lines = (s: string) => [...new Set(s.split('\n').map((l) => l.trim()).filter(Boolean))]

/** Sends a draft: the signed-in officer signs it (the server records who). */
function SendForm({ firId, notice, onSaved }: { firId: string; notice: Notice; onSaved: () => void }) {
  return (
    <Form title="Sign and send this notice" onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/notices/${notice.id}/send`, 'POST', {
        issuedAt: istIso(String(f.get('issued'))), replyDueOn: text(f, 'due'),
      })}>
      <label>Issued (date and time, IST) <input name="issued" type="datetime-local" required /></label>
      <label>Reply due by <input name="due" type="date" /></label>
    </Form>
  )
}

/** Logs a reply. The officer ticks each outstanding item the reply brought; unticked means it did not come. */
function ReplyForm({ firId, notice, onSaved }: { firId: string; notice: Notice; onSaved: () => void }) {
  const items = notice.items_requested.length ? notice.items_missing : [FULL_REPLY]
  return (
    <Form title="Log a reply" onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/notices/${notice.id}/replies`, 'POST', {
        receivedAt: istIso(String(f.get('received'))), channel: f.get('channel'),
        checksJson: JSON.stringify(items.map((item, i) => ({ item, present: f.get(`item${i}`) === 'on' }))),
      })}>
      <label>Received (date and time, IST) <input name="received" type="datetime-local" required /></label>
      <label>Came by <select name="channel">
        <option value="email">email</option><option value="portal">portal</option><option value="post">post</option><option value="by_hand">by hand</option>
      </select></label>
      {notice.items_requested.length > 0 && <p>Tick what this reply brought:</p>}
      {items.map((item, i) => <label key={item}><input name={`item${i}`} type="checkbox" /> {item}</label>)}
    </Form>
  )
}

/** Writes a new notice. Saved as a draft, or signed and sent at once by the signed-in officer. */
function NewNoticeForm({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const [body, setBody] = useState('')
  return (
    <Form title="Write a notice" onSaved={() => { setBody(''); onSaved() }}
      submit={(f) => {
        if (!body.trim()) throw new Error('Write the text of the notice.')
        const items = lines(String(f.get('items') ?? ''))
        if (f.get('kind') === 'BNSS_94' && !items.length) throw new Error('A BNSS 94 notice must list what is to be produced, one item per line.')
        const sendNow = f.get('sendNow') === 'on'
        return send(`/firs/${firId}/notices`, 'POST', {
          kind: f.get('kind'), addressee: text(f, 'addressee'), itemsRequested: items, body: body.trim(),
          status: sendNow ? 'sent' : 'draft', issuedAt: sendNow ? istIso(String(f.get('issued'))) : null,
          replyDueOn: sendNow ? text(f, 'due') : null,
        })
      }}>
      <label>Kind <select name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>To <input name="addressee" placeholder="Nodal Officer, Fictional Bank" required /></label>
      <label>Items to produce (one per line) <textarea name="items" rows={4} placeholder={'Account statement 01-09-2026 to 30-09-2026\nKYC documents\nBSA 63(4) certificate Part A'} /></label>
      <TypingField label="Text of the notice" value={body} onChange={setBody} multiline />
      <label><input name="sendNow" type="checkbox" /> I sign and send it now</label>
      <label>Issued (date and time, IST, if sent now) <input name="issued" type="datetime-local" /></label>
      <label>Reply due by (if sent now) <input name="due" type="date" /></label>
    </Form>
  )
}

/** Notices on the case, what each still waits for, and forms to write, send and log replies (case team only). */
export default function Notices({ firId }: { firId: string }) {
  const [version, setVersion] = useState(0)
  const saved = () => setVersion((v) => v + 1)
  const { data, error } = useLoad<Notice[]>(`/firs/${firId}/notices`, version)
  return (
    <section aria-labelledby="notices">
      <h2 id="notices">Notices</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : !data.length ? <p>None yet.</p> : (
        <ul>{data.map((n) => (
          <li key={n.id}>
            <strong>{KINDS[n.kind] ?? n.kind}</strong> to {n.addressee}: {STATUS[n.status] ?? n.status}
            {n.issued_at && <> · issued {fmt(n.issued_at)}{n.signed_by_name && ` by ${n.signed_by_name}`}</>}
            {n.reply_due_on && <> · reply due by {n.reply_due_on}</>}
            {n.replies > 0 && <> · {n.replies} {n.replies === 1 ? 'reply' : 'replies'}</>}
            {n.items_requested.length > 0 && (
              <ul>{n.items_requested.map((item) => (
                <li key={item}>{item}: {n.items_missing.includes(item) ? 'not received yet' : 'received'}</li>
              ))}</ul>
            )}
            {n.status === 'draft' && <SendForm firId={firId} notice={n} onSaved={saved} />}
            {['sent', 'reply_incomplete'].includes(n.status) && <ReplyForm firId={firId} notice={n} onSaved={saved} />}
          </li>
        ))}</ul>
      )}
      <NewNoticeForm firId={firId} onSaved={saved} />
    </section>
  )
}
