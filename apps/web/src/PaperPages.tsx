/**
 * A paper that may run over several pages, with the same line (the FIR number and police station) at the head of every one:
 * a browser repeats a table's head on each printed page. The table only lays the paper out (role "presentation").
 */
export default function PaperPages({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <table className="paper-running" role="presentation">
      <thead><tr><td>{head}</td></tr></thead>
      <tbody><tr><td>{children}</td></tr></tbody>
    </table>
  )
}
