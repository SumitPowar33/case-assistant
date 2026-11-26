import { caseExport, courtTime, type AiEntry, type ExportAnswer, type Person } from './auditCsv'
import PaperPages from './PaperPages'

export type CasePaper = { answer: ExportAnswer; entries: AiEntry[]; people: Person[]; at: string }

/** The day and the time each stay whole in a narrow column, on two lines if need be. */
function Time({ at }: { at: string }) {
  const [day, ...time] = courtTime(at).split(' ')
  return <><span>{day}</span> <span>{time.join(' ')}</span></>
}

/**
 * One case's audit entries as a paper for a court or an inquiry, in the courts' format (index.css, "Printed papers"), with
 * the FIR number and police station at the head of every page and a signature block for the officer who took it. The same
 * particulars, notes and entries as the CSV file, in English whatever the screen language.
 */
export default function AuditPaper({ paper: { answer, entries, people, at } }: { paper: CasePaper }) {
  const made = caseExport(answer, entries, people, at)
  return (
    <article className="print-copy court-paper audit-paper" aria-label="Audit entries of one case" lang="en">
      <PaperPages head={`FIR ${answer.fir_ref}, ${answer.station_name}`}>
        <h2>Audit entries of one case</h2>
        <ol className="paper-items">{made.particulars.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ol>
        {made.notes.map((n) => <p key={n}>{n} </p>)}
        <p>Entries starting “AI:” are kept by the AI gateway; the others by the application. Times are India time.</p>
        <table>
          <thead><tr><th scope="col">Time</th><th scope="col">Officer</th><th scope="col">Entry</th></tr></thead>
          <tbody>{made.entries.map((e, i) => (
            <tr key={i}>
              <td><Time at={e.at} /></td>
              <td>{e.officer}{e.rank && ` (${e.rank})`}</td>
              <td>{e.entry}{e.detail && `: ${e.detail}`}{e.reason && <><br />Reason: {e.reason}</>}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="paper-signs">
          <p>Place:<br />Date:</p>
          <p>Signature of the officer who took the export<br /><br />{answer.exported_by_name} ({answer.exported_by_rank})</p>
        </div>
      </PaperPages>
    </article>
  )
}
