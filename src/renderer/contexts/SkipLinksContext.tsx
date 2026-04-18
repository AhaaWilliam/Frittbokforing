import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'

interface SkipLinksContextValue {
  bulkActionsActive: boolean
  setBulkActionsActive: (active: boolean) => void
}

const SkipLinksContext = createContext<SkipLinksContextValue | null>(null)

export function SkipLinksProvider({ children }: { children: ReactNode }) {
  const [bulkActionsActive, setBulkActionsActive] = useState(false)
  const setActive = useCallback((active: boolean) => {
    setBulkActionsActive(active)
  }, [])
  const value = useMemo(
    () => ({ bulkActionsActive, setBulkActionsActive: setActive }),
    [bulkActionsActive, setActive],
  )
  return (
    <SkipLinksContext.Provider value={value}>
      {children}
    </SkipLinksContext.Provider>
  )
}

export function useSkipLinks(): SkipLinksContextValue {
  const ctx = useContext(SkipLinksContext)
  if (!ctx) {
    throw new Error('useSkipLinks måste användas inom SkipLinksProvider')
  }
  return ctx
}
