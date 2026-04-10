import { useState, useRef, useEffect, useCallback } from 'react'

interface UseDebouncedSearchResult {
  search: string
  debouncedSearch: string
  setSearch: (value: string) => void
}

export function useDebouncedSearch(delay = 300): UseDebouncedSearchResult {
  const [search, setSearchState] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [search, delay])

  const setSearch = useCallback((value: string) => {
    setSearchState(value)
  }, [])

  return { search, debouncedSearch, setSearch }
}
