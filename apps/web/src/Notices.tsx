import { useState, type MouseEvent } from 'react'
import { ai, send } from './api'
import { NOTICE_PROMPT_VERSION, noticePrompt, type NoticeFacts } from './noticePrompt'
import { Form } from './Forms'
import { REPLY_PROMPT_VERSION, MAX_REPLY, readReply, replyPrompt, type ReplyRead } from './replyReader'
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
const KINDS = ['BNSS_94', 'BNSS_35_3', 'BNSS_179', 'BNSS_106', 'follow_up']
const CHANNELS = ['email', 'portal', 'post', 'by_hand']
/** The check stored for a notice that asked for no list of items. It is stored in English, whatever the screen language. */
const FULL_REPLY = 'Reply answers the notice fully'
/** Chip colour per notice status (the word is always shown too). */
const STATUS_CHIP: Record<string, string> = { draft: 'c-ai', sent: 'c-info', reply_incomplete: 'c-warn', complete: 'c-ok', cancelled: 'c-neu' }
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

/**
 * Logs a reply. The officer ticks each outstanding item the reply brought; unticked means it did not come.
 * "Read the reply with AI" (design board 4, AI feature A4): the officer pastes the reply's text (it is not saved) and the
 * AI gateway (feature reply_check) suggests which items it brings, each with the words of the reply that show it, and
 * whether a BSA 63(4) certificate is in it. The boxes are only pre-ticked: the officer changes them, and saving logs
 * whether the ticks were kept (accepted) or changed (edited). Not offered on a case that protects the victim's identity.
 */
function ReplyForm({ firId, notice, victimProtected, onSaved }: { firId: string; notice: Notice; victimProtected: boolean; onSaved: () => void }) {
  const t = useT()
  const items = notice.items_requested.length ? notice.items_missing : [FULL_REPLY]
  const [ticks, setTicks] = useState<boolean[]>(() => items.map(() => false))
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<{ request_id: string; read: Extract<ReplyRead, { kind: 'read' }> }>()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const canAsk = !victimProtected && notice.items_requested.length > 0

  async function readIt() {
    setNote('')
    if (!text.trim()) { setNote(t('notice.replyNeedText')); return }
    if (text.length > MAX_REPLY) { setNote(t('notice.replyTooLong')); return }
    setBusy(true)
    try {
      const out = await ai<{ request_id: string; draft: string }>('/v1/generate', { method: 'POST', body: {
        feature: 'reply_check', prompt_version: REPLY_PROMPT_VERSION, prompt: replyPrompt(items, text, true), case_ref: firId, max_tokens: 1500 } })
      const read = readReply(out.draft, items, text, true)
      if (read.kind === 'unreadable') setNote(t('notice.replyUnreadable'))
      else { setAsked({ request_id: out.request_id, read }); setTicks(read.items.map((i) => i.present)) }
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <Form title={t('notice.replyTitle')} onSaved={() => { setTicks(items.map(() => false)); setText(''); setAsked(undefined); onSaved() }}
      submit={async (f) => {
        const result = await send(`/firs/${firId}/notices/${notice.id}/replies`, 'POST', {
          receivedAt: istIso(String(f.get('received'))), channel: f.get('channel'),
          checksJson: JSON.stringify(items.map((item, i) => ({ item, present: ticks[i] }))),
        })
        if (asked) {  // the reply is saved; a failure to log the decision must not make the officer save it twice
          const same = asked.read.items.every((r, i) => r.present === ticks[i])
          await ai('/v1/decisions', { method: 'POST', body: { request_id: asked.request_id, decision: same ? 'accepted' : 'edited', feature: 'reply_check', case_ref: firId, note: '' } }).catch(() => undefined)
        }
        return result
      }}>
      <label>{t('notice.received')} <input name="received" type="datetime-local" required /></label>
      <label>{t('notice.channel')} <select name="channel">{CHANNELS.map((c) => <option key={c} value={c}>{t.code('notice.channel', c)}</option>)}</select></label>
      {canAsk && (
        <>
          <label>{t('notice.replyText')} <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <p><button type="button" onClick={readIt} disabled={busy}>{t(busy ? 'notice.asking' : 'notice.readReply')}</button>{' '}
            <small>{t('notice.replySends')}</small></p>
        </>
      )}
      {note && <p role="alert">{note}</p>}
      {asked && (
        <section aria-label={t('notice.aiRead')} className="ai-draft">
          <p><span className="chip c-ai">{t('notice.aiRead')}</span> <small>{t('notice.aiReadHint')}</small></p>
          <ul>{asked.read.items.map((r) => (
            <li key={r.item}>{r.present ? t('notice.readFound', { item: r.item }) : t('notice.readNotFound', { item: r.item })}{r.quote && <> <q>{r.quote}</q></>}</li>
          ))}
            {asked.read.certificate && (
              <li>{asked.read.certificate.present ? t('notice.readCertYes') : t('notice.readCertNo')}{asked.read.certificate.quote && <> <q>{asked.read.certificate.quote}</q></>}</li>
            )}
          </ul>
        </section>
      )}
      {notice.items_requested.length > 0 && <p>{t('notice.tick')}</p>}
      {items.map((item, i) => (
        <label key={item}><input type="checkbox" checked={ticks[i] ?? false} onChange={(e) => setTicks(ticks.map((x, j) => (j === i ? e.target.checked : x)))} /> {item === FULL_REPLY ? t('notice.fullReply') : item}</label>
      ))}
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
        if (f.get('kind') === 'BNSS_106' && !items.length) throw new Error(t('notice.need106'))
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
export default function Notices({ firId, fir, victimProtected = false }: { firId: string; fir?: NoticeFacts['fir']; victimProtected?: boolean }) {
  const [version, setVersion] = useState(0)
  const saved = () => setVersion((v) => v + 1)
  const { data, error } = useLoad<Notice[]>(`/firs/${firId}/notices`, version)
  const t = useT()
  return (
    <section aria-labelledby="notices">
      <h2 id="notices">{t('notice.heading')}</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p>{t('common.loading')}</p> : !data.length ? <p>{t('common.noneYet')}</p> : (
        <ul className="plain">{data.map((n) => (
          <li key={n.id} className="card">
            <strong>{t.code('notice.kind', n.kind)}</strong> {t('notice.toLine', { addressee: n.addressee })}{' '}
            <span className={`chip ${STATUS_CHIP[n.status] ?? 'c-neu'}`}>{t.code('notice.status', n.status)}</span>
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
            {['sent', 'reply_incomplete'].includes(n.status) && <ReplyForm firId={firId} notice={n} victimProtected={victimProtected} onSaved={saved} />}
          </li>
        ))}</ul>
      )}
      <NewNoticeForm firId={firId} fir={fir} onSaved={saved} />
    </section>
  )
}
