// X-User-Id is a stand-in for login (see docs/PROGRESS.md); the API masks victim identity without it.
const userId = import.meta.env.VITE_USER_ID as string | undefined

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: userId ? { 'X-User-Id': userId } : {} })
  if (!res.ok) throw new Error(`The server answered ${res.status} for ${path}`)
  return res.json() as Promise<T>
}
