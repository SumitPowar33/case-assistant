import { useEffect, useState } from 'react'
import { get } from './api'

/** Loads path; changing version loads it again (after a save). No path, nothing to load. */
export function useLoad<T>(path: string | null, version = 0) {
  const [state, setState] = useState<{ data?: T; error?: string }>({})
  useEffect(() => {
    if (path === null) return
    let live = true
    get<T>(path).then(
      (data) => live && setState({ data }),
      (e: Error) => live && setState({ error: e.message }),
    )
    return () => { live = false }
  }, [path, version])
  return state
}
