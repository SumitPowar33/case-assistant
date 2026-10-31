import { useContext, useState, type FormEvent, type ReactNode } from 'react'
import { can, currentSession, send } from './api'
import TypingField from './TypingField'
import { TypingContext } from './typing'
import { istIso, parseSections, text } from './formats'
import { useT } from './i18n'

export function Form({ title, submit, onSaved, children }: {
  title: string; submit: (f: FormData) => Promise<unknown>; onSaved: (result: unknown) => void; children: ReactNode
}) {
  const t = useT()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setError(''); setBusy(true)
    try {
      const result = await submit(new FormData(form))
      form.reset()
      onSaved(result)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }
  return (
    <details>
      <summary>{title}</summary>
      <form className="record-form" onSubmit={go}>
        {children}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{t(busy ? 'form.saving' : 'form.save')}</button>
      </form>
    </details>
  )
}

/**
 * Register a new FIR at the signed-in officer's own station. With a signed complaint, the FIR takes the complaint's text
 * and time of receipt on the server, so those fields are not asked again.
 */
export function NewFirForm({ complaintId }: { complaintId?: string } = {}) {
  const { lang } = useContext(TypingContext)
  const t = useT()
  const [contents, setContents] = useState('')
  const me = currentSession()?.user
  const station = me?.station_id
  if (!station) return <p>{t('firForm.onlyStation')}</p>
  return (
    <Form title={t(complaintId ? 'firForm.fromComplaint' : 'firForm.new')} onSaved={(r) => { setContents(''); window.location.hash = `#/firs/${(r as { id: string }).id}` }}
      submit={(f) => {
        if (!complaintId && !contents.trim()) throw new Error(t('firForm.needWords'))
        return send('/firs', 'POST', {
        stationId: station, firYear: Number(f.get('year')), firNo: Number(f.get('no')), gdEntryNo: text(f, 'gd'),
        registeredAt: istIso(String(f.get('registered'))),
        ...(complaintId ? { complaintId } : { informationReceivedAt: istIso(String(f.get('received'))), contentsOriginal: contents.trim(), contentsLanguage: lang }),
        ioId: f.get('iAmIo') === 'on' ? me!.id : null, actionTaken: f.get('action'), actionReason: text(f, 'reason'),
        sexualOffence: f.get('sexual') === 'on', sections: parseSections(String(f.get('sections') ?? '')),
        })
      }}>
      <label>{t('firForm.year')} <input name="year" type="number" min={2024} max={2100} defaultValue={new Date().getFullYear()} required /></label>
      <label>{t('firForm.no')} <input name="no" type="number" min={1} required /></label>
      <label>{t('firForm.gd')} <input name="gd" required /></label>
      {!complaintId && <label>{t('firForm.received')} <input name="received" type="datetime-local" required /></label>}
      <label>{t('firForm.registered')} <input name="registered" type="datetime-local" required /></label>
      {complaintId ? <p><small>{t('firForm.fromSigned')}</small></p>
        : <TypingField label={t('desk.words')} value={contents} onChange={setContents} multiline />}
      <label>{t('firForm.sections')} <input name="sections" placeholder="BNS 318(4), IT Act 66D" /></label>
      <label>{t('firForm.action')} <select name="action" defaultValue="investigate">
        {ACTIONS.map((a) => <option key={a} value={a}>{t.code('action', a)}</option>)}
      </select></label>
      <label>{t('firForm.reason')} <input name="reason" /></label>
      <label><input name="sexual" type="checkbox" /> {t('firForm.sexual')}</label>
      {can('case.lead') && <label><input name="iAmIo" type="checkbox" defaultChecked={me!.case_scope === 'none'} /> {t('firForm.iAmIo')}</label>}
    </Form>
  )
}

/** What the officer did on the information (BNSS 173, 176); labels are action.<code>. */
const ACTIONS = ['investigate', 'self_investigation', 'refused', 'transferred']

/** Add a person to the case (case team only; the server checks). */
export function AddPersonForm({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  return (
    <Form title={t('personForm.title')} onSaved={() => { setName(''); onSaved() }}
      submit={(f) => send(`/firs/${firId}/people`, 'POST', {
        role: f.get('role'), label: text(f, 'label'), identityKnown: name.trim() !== '', fullName: name.trim() || null,
        ageYears: f.get('age') ? Number(f.get('age')) : null, gender: text(f, 'gender'), phone: text(f, 'phone'),
        addressPresent: text(f, 'address'), identityMasked: f.get('masked') === 'on',
      })}>
      <label>{t('personForm.role')} <select name="role">
        {['complainant', 'victim', 'accused', 'witness', 'suspect'].map((r) => <option key={r} value={r}>{t.code('person', r)}</option>)}
      </select></label>
      <label>{t('common.label')} <input name="label" placeholder="A1, W2, V1" /></label>
      <TypingField label={t('personForm.name')} value={name} onChange={setName} />
      <label>{t('personForm.age')} <input name="age" type="number" min={0} max={120} /></label>
      <label>{t('personForm.gender')} <input name="gender" /></label>
      <label>{t('personForm.phone')} <input name="phone" inputMode="tel" /></label>
      <label>{t('personForm.address')} <input name="address" /></label>
      <label><input name="masked" type="checkbox" /> {t('personForm.masked')}</label>
    </Form>
  )
}

/** Record a seized item. Electronic items need the SHA-256 taken at seizure. */
export function AddEvidenceForm({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const t = useT()
  const [description, setDescription] = useState('')
  return (
    <Form title={t('evForm.title')} onSaved={() => { setDescription(''); onSaved() }}
      submit={(f) => {
        const sha = text(f, 'sha256')
        if (f.get('kind') === 'electronic' && !/^[0-9a-fA-F]{64}$/.test(sha ?? '')) throw new Error(t('evForm.needSha'))
        return send(`/firs/${firId}/evidence`, 'POST', {
          label: text(f, 'label'), description: description.trim(), kind: f.get('kind'), seizedAt: istIso(String(f.get('seized'))),
          seizureMemo: text(f, 'memo'), esakshyaId: text(f, 'esakshya'), sealNo: text(f, 'seal'), sha256: sha,
        })
      }}>
      <label>{t('common.label')} <input name="label" placeholder="E-01" required /></label>
      <TypingField label={t('evForm.description')} value={description} onChange={setDescription} />
      <label>{t('common.kind')} <select name="kind">
        {['document', 'electronic', 'physical'].map((k) => <option key={k} value={k}>{t.code('evidenceKind', k)}</option>)}
      </select></label>
      <label>{t('evForm.seized')} <input name="seized" type="datetime-local" required /></label>
      <label>{t('evForm.memo')} <input name="memo" required /></label>
      <label>{t('evForm.esakshya')} <input name="esakshya" /></label>
      <label>{t('evForm.seal')} <input name="seal" /></label>
      <label>{t('evForm.sha')} <input name="sha256" spellCheck={false} /></label>
    </Form>
  )
}
