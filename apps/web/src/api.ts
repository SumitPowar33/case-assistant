// X-User-Id is a stand-in for login (see docs/PROGRESS.md); the API masks victim identity without it.
const userId = import.meta.env.VITE_USER_ID as string | undefined

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: userId ? { 'X-User-Id': userId } : {} })
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${path}`)
  return res.json() as Promise<T>
}

// The AI gateway (services/ai-gateway) is served under /ai. It has no login yet: see docs/PROGRESS.md.
export async function ai<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch(`/ai${path}`, init && {
    method: init.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body),
  })
  if (!res.ok) throw new Error(`The AI gateway answered ${res.status} for ${path}`)
  return res.json() as Promise<T>
}
export const actor = userId
