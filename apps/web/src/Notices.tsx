import { useState, type MouseEvent } from 'react'
import { ai, send } from './api'
import { NOTICE_PROMPT_VERSION, noticePrompt, type NoticeFacts } from './noticePrompt'
import { Form } from './Forms'
import TypingField from './TypingField'
import { fmt, istIso, text } from './formats'
import { useLoad } from './useLoad'
import { translateCode, useT } from './i18n'

type Notice = {
  id: string; kind: string; addressee: string; items_requested: string[]; items_missing: string[]; status: string
  issued_at: string | null; reply_due_on: string | null; signed_by_name: string | null; replies: number; ai_drafted: boolean
}
type Draft = { request_id: string; draft: string; provider: string; model: string; label: string }

/** Kinds a new notice can have; labels are notice.kind.<code>. Notices of old cases loaded from a file keep the CrPC
 *  section they were issued under (notice.kind.CrPC_91 and others); they cannot be typed new. */
const KINDS = ['BNSS_94', 'BNSS_35_3', 'BNSS_179', 'follow_up']
const CHANNELS = ['email', 'portal', 'post', 'by_hand']
/** The check stored for a notice that asked for no list of items. It is stored in English, whatever the screen language. */
const FULL_REPLY = 'Reply answers the notice fully'
const lines = (s: string) => [...new Set(s.split('\n').map((l) => l.trim()).filter(Boolean))]

/** Sends a draft: the signed-in officer signs it (the server records who). */
function SendForm({ firId, notice, onSaved }: { firId: string; notice: Notice; onSaved: () => void }) {
  const t = useT()
  return (
    <Form title={t('notice.sendTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/notices/${notice.id}/send`, 'POST', {
        issuedAt: istIso(String(f.get('issued'))), replyDueOn: text(f, 'due'),
      })}>
      <label>{t('notice.issued')} <input name="issued" type="datetime-local" required /></label>
      <label>{t('notice.dueBy')} <input name="due" type="date" /></label>
    </Form>
  )
}

/** Logs a reply. The officer ticks each outstanding item the reply brought; unticked means it did not come. */
function ReplyForm({ firId, notice, onSaved }: { firId: string; notice: Notice; onSaved: () => void }) {
  const t = useT()
  const items = notice.items_requested.length ? notice.items_missing : [FULL_REPLY]
  return (
    <Form title={t('notice.replyTitle')} onSaved={onSaved}
      submit={(f) => send(`/firs/${firId}/notices/${notice.id}/replies`, 'POST', {
        receivedAt: istIso(String(f.get('received'))), channel: f.get('channel'),
        checksJson: JSON.stringify(items.map((item, i) => ({ item, present: f.get(`item${i}`) === 'on' }))),
      })}>
      <label>{t('notice.received')} <input name="received" type="datetime-local" required /></label>
      <label>{t('notice.channel')} <select name="channel">{CHANNELS.map((c) => <option key={c} value={c}>{t.code('notice.channel', c)}</option>)}</select></label>
      {notice.items_requested.length > 0 && <p>{t('notice.tick')}</p>}
      {items.map((item, i) => <label key={item}><input name={`item${i}`} type="checkbox" /> {item === FULL_REPLY ? t('notice.fullReply') : item}</label>)}
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
  const t = useT()
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
    if (!addressee) { setAiNote(t('notice.fillTo', { to: t('notice.to') })); return }
    setAiBusy(true)
    try {
      // the prompt is in English whatever the screen language (it is versioned and audit-logged as written)
      const prompt = noticePrompt({ kind, kindLabel: translateCode('en', 'notice.kind', kind), addressee, items: lines(String(f.get('items') ?? '')), fir })
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
    <Form title={t('notice.writeTitle')} onSaved={() => { setBody(''); setDraft(undefined); setUsed(undefined); onSaved() }}
      submit={async (f) => {
        if (!body.trim()) throw new Error(t('notice.needText'))
        const items = lines(String(f.get('items') ?? ''))
        if (f.get('kind') === 'BNSS_94' && !items.length) throw new Error(t('notice.need94'))
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
          setAiNote(t('notice.savedNotLogged', { error: (err as Error).message }))
        }
        return result
      }}>
      <label>{t('common.kind')} <select name="kind">{KINDS.map((k) => <option key={k} value={k}>{t.code('notice.kind', k)}</option>)}</select></label>
      <label>{t('notice.to')} <input name="addressee" placeholder={t('notice.toPh')} required /></label>
      <label>{t('notice.items')} <textarea name="items" rows={4} placeholder={t('notice.itemsPh')} /></label>
      <p><button type="button" onClick={askAi} disabled={aiBusy}>{t(aiBusy ? 'notice.asking' : 'notice.askAi')}</button>{' '}
        <small>{t('notice.aiSends')}</small></p>
      {aiNote && <p role="alert">{aiNote}</p>}
      {draft && (
        <section aria-label={t('notice.aiDraft')} className="ai-draft">
          <p><strong>{draft.label}</strong> <small>({draft.provider} / {draft.model})</small></p>
          <pre>{draft.draft}</pre>
          <button type="button" onClick={() => { setBody(draft.draft); setUsed(draft) }}>{t('notice.useDraft')}</button>{' '}
          {draft.request_id !== used?.request_id && <button type="button" onClick={discard}>{t('notice.discard')}</button>}
          {draft.request_id === used?.request_id && <small>{t('notice.copied')}</small>}
        </section>
      )}
      <TypingField label={t('notice.text')} value={body} onChange={setBody} multiline />
      <label><input name="sendNow" type="checkbox" /> {t('notice.sendNow')}</label>
      <label>{t('notice.issuedIfNow')} <input name="issued" type="datetime-local" /></label>
      <label>{t('notice.dueIfNow')} <input name="due" type="date" /></label>
    </Form>
  )
}

/** Notices on the case, what each still waits for, and forms to write, send and log replies (case team only). */
export default function Notices({ firId, fir }: { firId: string; fir?: NoticeFacts['fir'] }) {
  const [version, setVersion] = useState(0)
  const saved = () => setVersion((v) => v + 1)
  const { data, error } = useLoad<Notice[]>(`/firs/${firId}/notices`, version)
  const t = useT()
  return (
    <section aria-labelledby="notices">
      <h2 id="notices">{t('notice.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('common.noneYet')}</p> : (
        <ul>{data.map((n) => (
          <li key={n.id}>
            <strong>{t.code('notice.kind', n.kind)}</strong> {t('notice.toLine', { addressee: n.addressee, status: t.code('notice.status', n.status) })}
            {n.issued_at && <> · {n.signed_by_name ? t('notice.issuedBy', { date: fmt(n.issued_at), name: n.signed_by_name }) : t('notice.issuedLine', { date: fmt(n.issued_at) })}</>}
            {n.reply_due_on && <> · {t('notice.dueLine', { date: n.reply_due_on })}</>}
            {n.ai_drafted && <> · {t('notice.aiDrafted')}</>}
            {n.replies > 0 && <> · {n.replies === 1 ? t('notice.oneReply') : t('notice.replies', { n: n.replies })}</>}
            {n.items_requested.length > 0 && (
              <ul>{n.items_requested.map((item) => (
                <li key={item}>{t(n.items_missing.includes(item) ? 'notice.itemMissing' : 'notice.itemReceived', { item })}</li>
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
