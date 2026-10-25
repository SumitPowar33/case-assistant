import { useContext, useState, type FormEvent, type ReactNode } from 'react'
import { currentSession, send } from './api'
import TypingField from './TypingField'
import { TypingContext } from './typing'
import { istIso, parseSections, text } from './formats'

export function Form({ title, submit, onSaved, children }: {
  title: string; submit: (f: FormData) => Promise<unknown>; onSaved: (result: unknown) => void; children: ReactNode
}) {
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
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </details>
  )
}

/** Register a new FIR at the signed-in officer's own station. */
export function NewFirForm() {
  const { lang } = useContext(TypingContext)
  const [contents, setContents] = useState('')
  const me = currentSession()?.user
  const station = me?.station_id
  if (!station) return <p>Only police station staff can register an FIR.</p>
  return (
    <Form title="Register a new FIR" onSaved={(r) => { setContents(''); window.location.hash = `#/firs/${(r as { id: string }).id}` }}
      submit={(f) => {
        if (!contents.trim()) throw new Error('Write the information as given.')
        return send('/firs', 'POST', {
        stationId: station, firYear: Number(f.get('year')), firNo: Number(f.get('no')), gdEntryNo: text(f, 'gd'),
        registeredAt: istIso(String(f.get('registered'))), informationReceivedAt: istIso(String(f.get('received'))),
        ioId: f.get('iAmIo') === 'on' ? me!.id : null, contentsOriginal: contents.trim(), contentsLanguage: lang, actionTaken: f.get('action'), actionReason: text(f, 'reason'),
        sexualOffence: f.get('sexual') === 'on', sections: parseSections(String(f.get('sections') ?? '')),
        })
      }}>
      <label>Year <input name="year" type="number" min={2024} max={2100} defaultValue={new Date().getFullYear()} required /></label>
      <label>FIR number <input name="no" type="number" min={1} required /></label>
      <label>General diary entry <input name="gd" required /></label>
      <label>Information received (date and time, IST) <input name="received" type="datetime-local" required /></label>
      <label>Registered (date and time, IST) <input name="registered" type="datetime-local" required /></label>
      <TypingField label="Information as given (in the informant's words)" value={contents} onChange={setContents} multiline />
      <label>Sections <input name="sections" placeholder="BNS 318(4), IT Act 66D" /></label>
      <label>Action taken <select name="action" defaultValue="investigate">
        <option value="investigate">Investigation taken up</option>
        <option value="self_investigation">Not investigated by self (give reason)</option>
        <option value="refused">Refused to investigate (give reason)</option>
        <option value="transferred">Transferred to the police station with jurisdiction</option>
      </select></label>
      <label>Reason (if not investigated) <input name="reason" /></label>
      <label><input name="sexual" type="checkbox" /> Sexual offence (protects the victim's identity, BNS 72)</label>
      {me!.role === 'io' && <label><input name="iAmIo" type="checkbox" defaultChecked /> I am the investigating officer</label>}
    </Form>
  )
}

/** Add a person to the case (case team only; the server checks). */
export function AddPersonForm({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const [name, setName] = useState('')
  return (
    <Form title="Add a person" onSaved={() => { setName(''); onSaved() }}
      submit={(f) => send(`/firs/${firId}/people`, 'POST', {
        role: f.get('role'), label: text(f, 'label'), identityKnown: name.trim() !== '', fullName: name.trim() || null,
        ageYears: f.get('age') ? Number(f.get('age')) : null, gender: text(f, 'gender'), phone: text(f, 'phone'),
        addressPresent: text(f, 'address'), identityMasked: f.get('masked') === 'on',
      })}>
      <label>Role <select name="role">
        {['complainant', 'victim', 'accused', 'witness', 'suspect'].map((r) => <option key={r} value={r}>{r}</option>)}
      </select></label>
      <label>Label <input name="label" placeholder="A1, W2, V1" /></label>
      <TypingField label="Full name (leave empty if not known)" value={name} onChange={setName} />
      <label>Age <input name="age" type="number" min={0} max={120} /></label>
      <label>Gender <input name="gender" /></label>
      <label>Phone <input name="phone" inputMode="tel" /></label>
      <label>Present address <input name="address" /></label>
      <label><input name="masked" type="checkbox" /> Protect this person's identity (BNS 72)</label>
    </Form>
  )
}

/** Record a seized item. Electronic items need the SHA-256 taken at seizure. */
export function AddEvidenceForm({ firId, onSaved }: { firId: string; onSaved: () => void }) {
  const [description, setDescription] = useState('')
  return (
    <Form title="Add evidence" onSaved={() => { setDescription(''); onSaved() }}
      submit={(f) => {
        const sha = text(f, 'sha256')
        if (f.get('kind') === 'electronic' && !/^[0-9a-fA-F]{64}$/.test(sha ?? '')) throw new Error('Electronic evidence needs the 64-character SHA-256 taken at seizure.')
        return send(`/firs/${firId}/evidence`, 'POST', {
          label: text(f, 'label'), description: description.trim(), kind: f.get('kind'), seizedAt: istIso(String(f.get('seized'))),
          seizureMemo: text(f, 'memo'), esakshyaId: text(f, 'esakshya'), sealNo: text(f, 'seal'), sha256: sha,
        })
      }}>
      <label>Label <input name="label" placeholder="E-01" required /></label>
      <TypingField label="Description" value={description} onChange={setDescription} />
      <label>Kind <select name="kind">
        <option value="document">document</option><option value="electronic">electronic</option><option value="physical">physical</option>
      </select></label>
      <label>Seized (date and time, IST) <input name="seized" type="datetime-local" required /></label>
      <label>Seizure memo number <input name="memo" required /></label>
      <label>eSakshya recording ID <input name="esakshya" /></label>
      <label>Seal number <input name="seal" /></label>
      <label>SHA-256 (electronic items) <input name="sha256" spellCheck={false} /></label>
    </Form>
  )
}
