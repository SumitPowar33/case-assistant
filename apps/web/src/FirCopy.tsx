import { useState } from 'react'
import { get } from './api'
import { fmt } from './formats'
import { useT } from './i18n'
import PaperPages from './PaperPages'

type Head = { fir_no: number; fir_year: number; registered_at: string; information_received_at: string; gd_entry_no: string; is_zero_fir: boolean
  outside_limits_place: string | null; occurrence_known: boolean; occurrence_from: string | null; occurrence_to: string | null; occurrence_place: string | null
  contents_original: string | null; contents_language: string; action_taken: string; action_reason: string | null
  station: string; district: string | null; state: string; io_name: string | null; io_rank: string | null; law: string; sections: string; later_sections: number }
type Signed = { mode: string; name: string; contact: string | null; signed_at: string | null; signed_recorded_by_name: string | null }
type Informant = { label: string | null; name: string | null; parentage: string | null; age_years: number | null; gender: string | null; address: string | null; contact: string | null }
type Copy = { withheld: boolean; head: Head; complaint: Signed | null; informants: Informant[] }

/**
 * The FIR copy as paper (item 18; GET /firs/{id}/copy), in the courts' format (index.css, "Printed papers"): the report
 * as registered, numbered paragraphs, the information in the words and language it was given, and blank signature lines.
 * The FIR number is at the head of every printed page ({@link PaperPages}). On a case that protects a person's identity
 * the server sends no name, place or text, and the paper says so.
 */
export default function FirCopy({ firId }: { firId: string }) {
  const t = useT()
  const [paper, setPaper] = useState<Copy | null>(null)
  const [error, setError] = useState('')

  async function show() {
    setError('')
    try {
      setPaper(await get<Copy>(`/firs/${firId}/copy`))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))
  const h = paper?.head
  const when = h && (!h.occurrence_known || (!h.occurrence_from && !h.occurrence_to) ? t('fircopy.notKnown')
    : [h.occurrence_from, h.occurrence_to].filter(Boolean).map((d) => fmt(d!)).join(' – '))
  const c = paper?.complaint
  return (
    <section aria-labelledby="fircopy-title">
      <h3 id="fircopy-title">{t('fircopy.title')}</h3>
      <p>{t('fircopy.lede')}</p>
      <button type="button" onClick={() => void show()}>{t('fircopy.show')}</button>
      {error && <p role="alert">{error}</p>}
      {h && paper && <article className="print-copy court-paper" aria-label={t('fircopy.label')}>
        <PaperPages head={t('paper.running', { no: h.fir_no, year: h.fir_year, station: h.station })}>
            <h2>{t('fircopy.heading')}</h2>
            <p className="paper-sub">{t(h.law === 'crpc' ? 'fircopy.underCrpc' : 'fircopy.underBnss')}</p>
            {paper.withheld && <p className="paper-court" role="note">{t('fircopy.withheld')}</p>}
            <ol className="paper-items">
              <li>{t('paper.district')} {dash(h.district)} · {t('paper.station')} {h.station} · {t('paper.year')} {h.fir_year} · {t('paper.firNo')} {h.fir_no}{h.is_zero_fir ? ` ${t('fir.zeroSuffix')}` : ''} · {t('paper.date')} {fmt(h.registered_at)}</li>
              <li>{t('paper.sections')} {dash(h.sections)}{h.later_sections > 0 && <> ({t('fircopy.laterSections', { n: h.later_sections })})</>}</li>
              <li>{t('fircopy.occurrence')} {when}</li>
              <li>{t('fircopy.received', { time: fmt(h.information_received_at), gd: h.gd_entry_no })}</li>
              <li>{t('fircopy.place')} {dash(h.occurrence_place)}{h.outside_limits_place && <> · {t('fircopy.outside', { place: h.outside_limits_place })}</>}</li>
              <li>{t('paper.informant')}
                {c ? <> {c.name}{c.contact ? `, ${c.contact}` : ''} ({t.code('mode', c.mode)}){c.signed_at && <> · {t('fircopy.signed', { time: fmt(c.signed_at), officer: c.signed_recorded_by_name ?? '' })}</>}</>
                  : paper.informants.length ? <> {paper.informants.map((p) => [p.name ?? t('paper.unknown'), p.parentage, p.age_years, p.gender, p.address, p.contact].filter(Boolean).join(', ')).join('; ')}</> : ' —'}</li>
              <li>{t('fircopy.contents', { language: h.contents_language.toUpperCase() })}
                {h.contents_original ? <blockquote lang={h.contents_language}>{h.contents_original}</blockquote> : ' —'}</li>
              <li>{t('fircopy.action')} {t.code('action', h.action_taken)}{h.action_reason && `: ${h.action_reason}`}</li>
              <li>{t('paper.io')} {h.io_name ? `${h.io_name} (${dash(h.io_rank)})` : '—'}</li>
              <li>{t('fircopy.dispatch')}</li>
            </ol>
            <p>{t(h.law === 'crpc' ? 'fircopy.freeCrpc' : 'fircopy.freeBnss')}</p>
            <div className="paper-signs">
              <p>{t('fircopy.signInformant')}</p>
              <p>{t('fircopy.signOfficer')}</p>
            </div>
            <p><small>{t('fircopy.record')}</small></p>
        </PaperPages>
        <button type="button" className="no-print" onClick={() => window.print()}>{t('fircopy.print')}</button>
      </article>}
    </section>
  )
}
