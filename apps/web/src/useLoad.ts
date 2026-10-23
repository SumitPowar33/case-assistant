import { useEffect, useState } from 'react'
import { get } from './api'

export function useLoad<T>(path: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({})
  useEffect(() => {
    let live = true
    get<T>(path).then(
      (data) => live && setState({ data }),
      (e: Error) => live && setState({ error: e.message }),
    )
    return () => { live = false }
  }, [path])
  return state
}
