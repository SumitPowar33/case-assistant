import { useT } from './i18n'
import { usePaperName, type Enclosure } from './paperIndex'

const CHIP = { ok: 'c-ok', wait: 'c-warn', missing: 'c-crit' } as const

/**
 * The papers that go with the report (BNSS 193(6) and (8); the annexures of design board 10), on the Final report part:
 * one line for each kind with its count, and every paper still expected or not on file named under it. From the records
 * of the case; the server makes the list, nothing is typed here.
 */
export default function Enclosures({ list }: { list: Enclosure[] }) {
  const t = useT()
  const name = usePaperName()
  const kinds = [...new Set(list.map((e) => e.kind))]
  return (
    <section className="encl" aria-labelledby="encl-title">
      <h2 id="encl-title">{t('encl.title', { count: list.length })}</h2>
      <p className="note">{t('encl.lede')}</p>
      <ul className="plain">{kinds.map((k) => {
        const rows = list.filter((e) => e.kind === k), open = rows.filter((e) => e.state !== 'ok')
        return (
          <li key={k} className="card">
            <strong>{t.code('encl.kind', k)}</strong> ({rows.length}) {!open.length && <span className="chip c-ok">{t('encl.note.ok')}</span>}
            {open.map((e, i) => <p key={i}>{name(e)} <span className={`chip ${CHIP[e.state]}`}>{t.code('encl.note', e.note ?? 'ok')}</span></p>)}
          </li>
        )
      })}</ul>
    </section>
  )
}
