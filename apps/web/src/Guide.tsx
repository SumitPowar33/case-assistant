import { useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { ai } from './api'
import { HELP_PROMPT_VERSION, checkHelp, helpMaterial, helpPrompt, type HelpAnswer } from './appHelp'
import { ScreenLangContext, useT } from './i18n'
import type { Screen } from './screens'

/**
 * The tour: one step per screen this officer can open, in menu order. Each step opens its screen and says what it is for,
 * in the screen language, from the same list as the menu (screens.ts), so the tour never names a screen the officer cannot open.
 */
export function Tour({ screens: start, onClose }: { screens: Screen[]; onClose: () => void }) {
  const t = useT()
  const [screens] = useState(start)   // the steps as the tour began: leaving an FIR must not drop its parts mid-tour
  const [i, setI] = useState(0)   // 0: the welcome; 1…: the screens. The screen open when it starts stays open until Next.
  const heading = useRef<HTMLHeadingElement>(null)
  const step = i > 0 ? screens[i - 1] : undefined
  const caseOpen = screens.some((s) => s.group === 'case')
  useEffect(() => {
    if (step && window.location.hash !== step.href && !(step.href === '#/' && !window.location.hash)) window.location.hash = step.href
    if (i > 0) heading.current?.focus()
  }, [step, i])
  const last = i >= screens.length
  return (
    <aside className="card guide" role="dialog" aria-labelledby="tour-step">
      {step && <p className="sub">{t('tour.step', { n: i, total: screens.length })}</p>}
      <h2 id="tour-step" ref={heading} tabIndex={-1}>{t(step ? step.label : 'tour.welcome')}</h2>
      <p>{t(step ? step.about : 'tour.intro')}</p>
      {step?.href === '#/firs' && !caseOpen && <p>{t('tour.openFir')}</p>}
      <p className="guide-actions">
        {i > 0 && <button type="button" onClick={() => setI(i - 1)}>{t('tour.back')}</button>}
        {last ? <button type="button" className="btn-p" onClick={onClose}>{t('tour.done')}</button>
          : <button type="button" className="btn-p" onClick={() => setI(i + 1)}>{t('tour.next')}</button>}
        {!last && <button type="button" onClick={onClose}>{t('tour.end')}</button>}
      </p>
    </aside>
  )
}

type Turn = { id: number; q: string; answer: HelpAnswer }

/**
 * The help chat: the officer asks how to do something; the question, the names of the screens they can open, what each is
 * for and the texts of the screens that match go to the AI gateway (feature app_help), never case data. The answer must name
 * the screens it uses by number; those become links. An answer naming none is marked, and "not in the app" says so.
 */
export function HelpChat({ screens, here, onClose, onTour }: { screens: Screen[]; here: string; onClose: () => void; onTour: () => void }) {
  const t = useT()
  const lang = useContext(ScreenLangContext)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function ask(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (q.length < 3 || busy) return
    setNote('')
    setBusy(true)
    const material = helpMaterial(q, screens, lang, here)
    try {
      const out = await ai<{ draft: string }>('/v1/generate', { method: 'POST', body: {
        feature: 'app_help', prompt_version: HELP_PROMPT_VERSION, prompt: helpPrompt(q, material, here), max_tokens: 700 } })
      setTurns([{ id: turns.length + 1, q, answer: checkHelp(out.draft, material) }, ...turns])
      setQuestion('')
    } catch (err) {
      setNote((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <aside className="card guide" role="dialog" aria-labelledby="help-title">
      <h2 id="help-title">{t('help.title')}</h2>
      <p className="guide-actions">
        <button type="button" onClick={onTour}>{t('help.tour')}</button>
        <button type="button" onClick={onClose}>{t('help.close')}</button>
      </p>
      <form onSubmit={ask}>
        <label>{t('help.question')} <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} /></label>{' '}
        <button type="submit" disabled={busy || question.trim().length < 3}>{t(busy ? 'help.asking' : 'help.ask')}</button>
        <p><small>{t('help.sends')}</small></p>
      </form>
      {note && <p role="alert">{note}</p>}
      {turns.map((x) => (
        <section key={x.id} className="ai-draft" aria-label={x.q}>
          <p><strong>{x.q}</strong></p>
          <p><span className="chip c-ai">{t('help.draft')}</span>{' '}
            {x.answer.kind === 'notInApp' && <span className="chip c-neu">{t('help.notInApp')}</span>}
            {x.answer.kind === 'unsourced' && <span className="chip c-warn">{t('help.unsourced')}</span>}</p>
          {x.answer.kind !== 'notInApp' && <pre>{x.answer.text}</pre>}
          {x.answer.screens.length > 0 && <ul className="plain">{x.answer.screens.map((s) => (
            <li key={s.tag}><span className="chip c-info">{s.tag}</span> <a href={s.href}>{t('help.goTo', { screen: s.name })}</a></li>
          ))}</ul>}
        </section>
      ))}
    </aside>
  )
}
