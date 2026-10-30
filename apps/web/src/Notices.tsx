import { useState, type MouseEvent } from 'react'
import { ai, send } from './api'
import { NOTICE_PROMPT_VERSION, noticePrompt, type NoticeFacts } from './noticePrompt'
import { Form } from './Forms'
import TypingField from './TypingField'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'

type Notice = {
  id: string; kind: string; addressee: string; items_requested: string[]; items_missing: string[]; status: string
  issued_at: string | null; reply_due_on: string | null; signed_by_name: string | null; replies: number; ai_drafted: boolean
}
type Draft = { request_id: string; draft: string; provider: string; model: string; label: string }

const KINDS: Record<string, string> = {
  BNSS_94: 'BNSS 94: produce documents or data', BNSS_35_3: 'BNSS 35(3): appear before the officer',
  BNSS_179: 'BNSS 179: attend as a witness', follow_up: 'Follow-up',
}
/** Notices of old cases loaded from a file keep the CrPC section they were issued under; they cannot be typed new. */
const OLD_KINDS: Record<string, string> = {
  CrPC_91: 'CrPC 91 (old law): produce documents', CrPC_41A: 'CrPC 41A (old law): appear', CrPC_160: 'CrPC 160 (old law): attend as a witness',
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

/**
 * Writes a new notice. Saved as a draft, or signed and sent at once by the signed-in officer.
 * "Draft the text with AI" asks the AI gateway for a draft from the notice's own facts only (see noticePrompt).
 * The draft is shown apart, marked as an AI draft; the officer chooses to use it (then edits it as they like) or
 * discard it. Nothing from the AI is saved unless the officer saves the notice. When the notice is saved, the
 * gateway's audit log gets the officer's decision: accepted (used unchanged), edited, or rejected (not used).
 */
function NewNoticeForm({ firId, fir, onSaved }: { firId: string; fir?: NoticeFacts['fir']; onSaved: () => void }) {
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState<Draft>()
  const [used, setUsed] = useState<Draft>()
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')

  async function decide(d: Draft, decision: 'accepted' | 'edited' | 'rejected', note = '') {
    await ai('/v1/decisions', { method: 'POST', body: { request_id: d.request_id, decision, feature: 'notice_draft', case_ref: firId, note } })
  }

  async function askAi(e: MouseEvent<HTMLButtonElement>) {
    const f = new FormData(e.currentTarget.form!)
    const kind = String(f.get('kind'))
    const addressee = text(f, 'addressee')
    setAiNote('')
    if (!addressee) { setAiNote('Fill in "To" first.'); return }
    setAiBusy(true)
    try {
      const prompt = noticePrompt({ kind, kindLabel: KINDS[kind] ?? kind, addressee, items: lines(String(f.get('items') ?? '')), fir })
      const out = await ai<Draft>('/v1/generate', { method: 'POST', body: {
        feature: 'notice_draft', prompt_version: NOTICE_PROMPT_VERSION, prompt, case_ref: firId, max_tokens: 1200 } })
      if (draft && draft.request_id !== used?.request_id) await decide(draft, 'rejected', 'replaced by a new draft').catch(() => undefined)
      setDraft(out)
    } catch (err) {
      setAiNote((err as Error).message)
    }
    setAiBusy(false)
  }

  async function discard() {
    if (!draft) return
    setAiNote('')
    try { await decide(draft, 'rejected'); setDraft(undefined) } catch (err) { setAiNote((err as Error).message) }
  }

  return (
    <Form title="Write a notice" onSaved={() => { setBody(''); setDraft(undefined); setUsed(undefined); onSaved() }}
      submit={async (f) => {
        if (!body.trim()) throw new Error('Write the text of the notice.')
        const items = lines(String(f.get('items') ?? ''))
        if (f.get('kind') === 'BNSS_94' && !items.length) throw new Error('A BNSS 94 notice must list what is to be produced, one item per line.')
        const sendNow = f.get('sendNow') === 'on'
        const result = await send(`/firs/${firId}/notices`, 'POST', {
          kind: f.get('kind'), addressee: text(f, 'addressee'), itemsRequested: items, body: body.trim(),
          aiRequestId: used?.request_id ?? null,
          status: sendNow ? 'sent' : 'draft', issuedAt: sendNow ? istIso(String(f.get('issued'))) : null,
          replyDueOn: sendNow ? text(f, 'due') : null,
        })
        // The notice is saved; now record what the officer did with the AI draft. A failure here must not
        // make the officer save the notice twice, so it is reported but not thrown.
        try {
          if (used) await decide(used, body.trim() === used.draft.trim() ? 'accepted' : 'edited')
          if (draft && draft.request_id !== used?.request_id) await decide(draft, 'rejected', 'not used')
        } catch (err) {
          setAiNote(`The notice is saved, but the decision on the AI draft could not be logged: ${(err as Error).message}`)
        }
        return result
      }}>
      <label>Kind <select name="kind">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>To <input name="addressee" placeholder="Nodal Officer, Fictional Bank" required /></label>
      <label>Items to produce (one per line) <textarea name="items" rows={4} placeholder={'Account statement 01-09-2026 to 30-09-2026\nKYC documents\nBSA 63(4) certificate Part A'} /></label>
      <p><button type="button" onClick={askAi} disabled={aiBusy}>{aiBusy ? 'Asking the AI…' : 'Draft the text with AI'}</button>{' '}
        <small>Sends only the kind, the FIR number and sections, the items{' '}and, for BNSS 94, who it is to. Never the complaint or names of people.</small></p>
      {aiNote && <p role="alert">{aiNote}</p>}
      {draft && (
        <section aria-label="AI draft" className="ai-draft">
          <p><strong>{draft.label}</strong> <small>({draft.provider} / {draft.model})</small></p>
          <pre>{draft.draft}</pre>
          <button type="button" onClick={() => { setBody(draft.draft); setUsed(draft) }}>Use this draft</button>{' '}
          {draft.request_id !== used?.request_id && <button type="button" onClick={discard}>Discard</button>}
          {draft.request_id === used?.request_id && <small>Copied into the text below. Check and correct it before you save.</small>}
        </section>
      )}
      <TypingField label="Text of the notice" value={body} onChange={setBody} multiline />
      <label><input name="sendNow" type="checkbox" /> I sign and send it now</label>
      <label>Issued (date and time, IST, if sent now) <input name="issued" type="datetime-local" /></label>
      <label>Reply due by (if sent now) <input name="due" type="date" /></label>
    </Form>
  )
}

/** Notices on the case, what each still waits for, and forms to write, send and log replies (case team only). */
export default function Notices({ firId, fir }: { firId: string; fir?: NoticeFacts['fir'] }) {
  const [version, setVersion] = useState(0)
  const saved = () => setVersion((v) => v + 1)
  const { data, error } = useLoad<Notice[]>(`/firs/${firId}/notices`, version)
  return (
    <section aria-labelledby="notices">
      <h2 id="notices">Notices</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>Loading…</p> : !data.length ? <p>None yet.</p> : (
        <ul>{data.map((n) => (
          <li key={n.id}>
            <strong>{KINDS[n.kind] ?? OLD_KINDS[n.kind] ?? n.kind}</strong> to {n.addressee}: {STATUS[n.status] ?? n.status}
            {n.issued_at && <> · issued {fmt(n.issued_at)}{n.signed_by_name && ` by ${n.signed_by_name}`}</>}
            {n.reply_due_on && <> · reply due by {n.reply_due_on}</>}
            {n.ai_drafted && <> · text drafted with AI, checked by the officer</>}
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
      <NewNoticeForm firId={firId} fir={fir} onSaved={saved} />
    </section>
  )
}
