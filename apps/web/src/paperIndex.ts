import type { Key } from './i18n'
import { useT } from './i18n'

/** One paper that goes with the final report (GET /firs/{id}/final-report and .../print, `enclosures`). */
export type Enclosure = { kind: string; ref: string | null; detail: string | null; on_date: string | null; state: 'ok' | 'wait' | 'missing'; note: string | null }

/** The line of one paper in the index: what it is, of whom or which item (a label), and to or from whom when the server sends it. */
export function usePaperName() {
  const t = useT()
  return (e: Enclosure) => {
    const ref = e.kind === 'notice' ? t.code('notice.kind', e.ref ?? '') : e.ref
    const key = ref ? `encl.row.${e.kind}` : `encl.row.${e.kind}.plain`
    return t(key as Key, { ref: ref ?? '' }) + (e.detail ? `: ${e.detail}` : '')
  }
}
