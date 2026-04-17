import { useCallback, useEffect, useState } from 'react'
import { getHashParams, setHashParams } from './router'

export function usePageParam(
  key: string,
  defaultPage = 0,
): [number, (page: number) => void] {
  const [page, setPageState] = useState(() => {
    const raw = getHashParams().get(key)
    const parsed = raw ? parseInt(raw, 10) : defaultPage
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultPage
  })

  useEffect(() => {
    function onHashChange() {
      const raw = getHashParams().get(key)
      const parsed = raw ? parseInt(raw, 10) : defaultPage
      setPageState(
        Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultPage,
      )
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [key, defaultPage])

  const setPage = useCallback(
    (p: number) => {
      setPageState(p)
      const params = getHashParams()
      if (p === defaultPage) {
        params.delete(key)
      } else {
        params.set(key, String(p))
      }
      const entries: Record<string, string> = {}
      params.forEach((v, k) => {
        entries[k] = v
      })
      setHashParams(entries)
    },
    [key, defaultPage],
  )

  return [page, setPage]
}
