// What the audit screen reads about the AI's entries: the list and the export of one case share it.
import { get } from './api'
import type { AiEntry, Person } from './auditCsv'

export type CaseRef = { id: string; kind: string; fir_id: string | null; ref: string | null }
export type AiEvent = AiEntry & { case_id: string }

/** The names of the officers the gateway's entries give by id, a few at a time (the web server limits a request's address). */
export async function officers(station: string, events: AiEntry[]): Promise<Person[]> {
  const ids = [...new Set(events.map((e) => e.actor))]
  const out: Person[] = []
  for (let i = 0; i < ids.length; i += 50) out.push(...await get<Person[]>(`/audit-log/people?stationId=${station}&id=${ids.slice(i, i + 50).join('&id=')}`))
  return out
}
