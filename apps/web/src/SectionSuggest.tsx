import { useState } from 'react'
import { ai, send } from './api'
import { SECTION_PROMPT_VERSION, graverFirst, readSuggestions, sectionPrompt, type Charge, type SuggestRead } from './sectionSuggest'
import { fmt } from './formats'
import { useLoad } from './useLoad'
import { useT } from './i18n'

type Law = 'new' | 'old' | 'spans' | 'unknown'
type Added = { act: string; section: string; added_at: string | null; reason: string | null; chosen_by_name: string | null }
type Basis = { law: Law; sections: Added[]; charges: Charge[] }
type Draft = { request_id: string; draft: string; provider: string; model: string }
type Choice = 'open' | 'added' | 'skipped'
type Check = { request: Draft; read: SuggestRead; choices: Choice[]; reasons: string[]; logged?: string }

/**
 * AI section suggestion (AI feature A2). The officer asks the AI gateway (feature section_suggest) which charges of the
 * playbooks the FIR text may describe. A charge is shown only with the playbook's own ingredient texts and the words of
 * the FIR it points at; the officer adds it to the FIR with a reason (POST /firs/{id}/sections, case team only) or leaves
 * it. A BNS section is not offered for an offence under the IPC (before 1 July 2024). Finishing logs the decision in the
 * gateway. Not offered on a case that protects the victim's identity (as the fact check, question for Sumit).
 */
export default function SectionSuggest({ firId, text, victimProtected, version, onSaved }: {
  firId: string; text: string; victimProtected: boolean; version: number; onSaved: () => void
}) {
  const t = useT()
  const { data, error } = useLoad<Basis>(`/firs/${firId}/sections`, version)
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>{t('common.loading')}</p>
  const blocked = (c: Charge) => c.act === 'BNS' && data.law === 'old'
  const addable = (c: Charge) => !c.in_fir && !blocked(c)

  async function suggest(b: Basis) {
    setNote('')
    setBusy(true)
    try {
      const request = await ai<Draft>('/v1/generate', { method: 'POST', body: {
        feature: 'section_suggest', prompt_version: SECTION_PROMPT_VERSION, prompt: sectionPrompt(text, b.charges), case_ref: firId, max_tokens: 1500 } })
      const read = graverFirst(readSuggestions(request.draft, text, b.charges))
      const n = read.kind === 'suggestions' ? read.suggestions.length : 0
      setCheck({ request, read, choices: Array<Choice>(n).fill('open'), reasons: Array<string>(n).fill('') })
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  async function add(c: Check, i: number, charge: Charge) {
    setNote('')
    try {
      await send(`/firs/${firId}/sections`, 'POST', { playbookId: charge.playbook_id, chargeId: charge.charge_id, reason: c.reasons[i].trim(), aiRequestId: c.request.request_id })
      setCheck({ ...c, choices: c.choices.map((x, j) => (j === i ? 'added' : x)) })
      onSaved()
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  async function finish(c: Check) {
    setNote('')
    const list = c.read.kind === 'suggestions' ? c.read.suggestions : null
    const open = list ? list.filter((s) => addable(s.charge)).length : 0
    const added = c.choices.filter((x) => x === 'added').length
    // an unreadable answer is rejected; nothing to add (all already in the FIR, or none found) is the AI agreed with
    const decision = !list || (open && !added) ? 'rejected' : added < open ? 'edited' : 'accepted'
    try {
      await ai('/v1/decisions', { method: 'POST', body: { request_id: c.request.request_id, decision, feature: 'section_suggest', case_ref: firId,
        note: `${added} of ${open} suggested sections added, ${(list?.length ?? 0) - open} already in the FIR or not of its law` } })
      setCheck({ ...c, logged: decision })
    } catch (err) {
      setNote((err as Error).message)
    }
  }

  const later = data.sections.filter((s) => s.added_at)
  return (
    <section aria-labelledby="sections-title">
      <h2 id="sections-title">{t('sections.title')}</h2>
      <p role="note">{t.code('sections.law', data.law)}{data.law === 'old' && <> <a href="#/laws">{t('nav.laws')}</a></>}</p>
      {later.length > 0 && <ul className="plain">{later.map((s) => (
        <li key={s.act + s.section} className="card"><span className="chip c-ok">{s.act} {s.section}</span>{' '}
          <small>{t('sections.addedBy', { name: s.chosen_by_name!, date: fmt(s.added_at!) })}</small><br />{s.reason}</li>
      ))}</ul>}
      {victimProtected ? <p role="note">{t('sections.notOnProtected')}</p> : (
        <p><button type="button" onClick={() => void suggest(data)} disabled={busy}>{t(busy ? 'facts.reading' : 'sections.suggest')}</button>{' '}
          <small>{t('sections.sends')}</small></p>
      )}
      {note && <p role="alert">{note}</p>}
      {check && (
        <div className="card" aria-label={t('sections.aiPanel')}>
          <p><span className="chip c-ai">{t('sections.aiPanel')}</span> <small>{check.request.provider} · {check.request.model}</small></p>
          {check.read.kind === 'unreadable' ? <p>{t('sections.unreadable')}</p> : (() => {
            const c = check as Check & { read: { kind: 'suggestions' } }
            return <>
              <p><small>{t('sections.caution')}</small></p>
              {!c.read.suggestions.length && <p>{t('sections.noneFound')}</p>}
              {c.read.dropped > 0 && <p><small>{t('sections.dropped', { n: c.read.dropped })}</small></p>}
              <ul className="plain">{c.read.suggestions.map(({ charge, met }, i) => {
                const seen = new Set(met.map((m) => m.id))
                const rest = charge.ingredients.filter((g) => !seen.has(g.id))
                return (
                  <li key={charge.playbook_id + charge.charge_id} className="card" aria-label={charge.law}>
                    <span className="chip c-info">{charge.law}</span> <strong>{charge.label}</strong>
                    {charge.punishment && <> <span className="chip c-neu">{t.code('arrest.pun', charge.punishment)}</span></>}
                    {charge.graver && <> <span className="chip c-crit">{t('sections.graver')}</span><p><small>{t('sections.graverNote')}</small></p></>}
                    <p>{t('sections.mayDescribe')}</p>
                    <ul>{met.map((m) => (
                      <li key={m.id}>{charge.ingredients.find((g) => g.id === m.id)!.text}: <small>{t('facts.from')} <q><mark className="c-ai">{m.quote}</mark></q></small></li>
                    ))}</ul>
                    {rest.length > 0 && <p><small>{t('sections.notSeen', { list: rest.map((g) => g.text).join('; ') })}</small></p>}
                    {charge.in_fir ? <p><span className="chip c-neu">{t('sections.inFir')}</span></p>
                      : blocked(charge) ? <p><span className="chip c-warn">{t('sections.ipcApplies')}</span></p>
                      : c.choices[i] === 'open' ? <>
                        <label>{t('sections.reason')} <textarea value={c.reasons[i]} maxLength={2000} rows={2}
                          onChange={(e) => setCheck({ ...c, reasons: c.reasons.map((r, j) => (j === i ? e.target.value : r)) })} /></label>
                        <p><button type="button" onClick={() => void add(c, i, charge)} disabled={c.reasons[i].trim().length < 10 || !!c.logged}>{t('sections.add')}</button>{' '}
                          <button type="button" onClick={() => setCheck({ ...c, choices: c.choices.map((x, j) => (j === i ? 'skipped' : x)) })} disabled={!!c.logged}>{t('sections.skip')}</button></p>
                      </> : <p><span className={`chip ${c.choices[i] === 'added' ? 'c-ok' : 'c-neu'}`}>{t(c.choices[i] === 'added' ? 'sections.added' : 'sections.skipped')}</span></p>}
                  </li>
                )
              })}</ul>
            </>
          })()}
          {check.logged ? <p>{t('facts.logged', { decision: t.code('facts.decision', check.logged) })}</p>
            : <p><button type="button" onClick={() => void finish(check)}>{t('facts.finish')}</button> <small>{t('facts.finishNote')}</small></p>}
        </div>
      )}
    </section>
  )
}
