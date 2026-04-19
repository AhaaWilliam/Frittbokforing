import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react'
import type { Company } from '../../shared/types'
import { useCompanies } from '../lib/hooks'

/**
 * ActiveCompanyContext — speglar FiscalYearContext-mönstret för
 * multicompany-stöd (Sprint MC2).
 *
 * Persisterar valt bolag i settings.last_company_id (resolveras i main
 * av getActiveCompanyId). Auto-persist väntar på restoredIdLoaded enligt
 * M102-mönstret för att inte skriva över användarens senaste val med
 * temporär fallback.
 */

interface ActiveCompanyContextValue {
  activeCompany: Company | null
  setActiveCompany: (company: Company) => void
  allCompanies: Company[]
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(
  null,
)

export function ActiveCompanyProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: allCompanies = [] } = useCompanies()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [restoredId, setRestoredId] = useState<number | null>(null)
  const [restoredIdLoaded, setRestoredIdLoaded] = useState(false)

  useEffect(() => {
    window.api
      .getSetting('last_company_id')
      .then((id: unknown) => {
        if (typeof id === 'number') setRestoredId(id)
      })
      .catch((err: unknown) => {
        console.warn(
          '[ActiveCompanyContext] Kunde inte läsa last_company_id:',
          err,
        )
      })
      .finally(() => {
        setRestoredIdLoaded(true)
      })
  }, [])

  const activeCompany = useMemo<Company | null>(() => {
    if (selectedId) {
      const found = allCompanies.find((c) => c.id === selectedId)
      if (found) return found
    }
    if (restoredId) {
      const restored = allCompanies.find((c) => c.id === restoredId)
      if (restored) return restored
    }
    return allCompanies[0] ?? null
  }, [selectedId, restoredId, allCompanies])

  const setActiveCompany = useCallback((company: Company) => {
    setSelectedId(company.id)
    void window.api.switchCompany({ company_id: company.id })
  }, [])

  // Auto-persist fallback-vald bolag till settings — väntar på att
  // restoredId-läsningen är klar (M102) så vi inte skriver över ett tidigare val.
  useEffect(() => {
    if (activeCompany && !selectedId && !restoredId && restoredIdLoaded) {
      void window.api.switchCompany({ company_id: activeCompany.id })
    }
  }, [activeCompany, selectedId, restoredId, restoredIdLoaded])

  const value = useMemo<ActiveCompanyContextValue>(
    () => ({
      activeCompany,
      setActiveCompany,
      allCompanies,
    }),
    [activeCompany, setActiveCompany, allCompanies],
  )

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  )
}

export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = useContext(ActiveCompanyContext)
  if (!ctx) {
    throw new Error(
      'useActiveCompany måste användas inom ActiveCompanyProvider',
    )
  }
  return ctx
}
