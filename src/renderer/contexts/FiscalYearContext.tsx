import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react'
import type { FiscalYear, FiscalYearContextValue } from '../../shared/types'
import { useFiscalYears } from '../lib/hooks'

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null)

export function FiscalYearProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: allFiscalYears = [] } = useFiscalYears()
  const [selectedYear, setSelectedYear] = useState<FiscalYear | null>(null)
  const [restoredId, setRestoredId] = useState<number | null>(null)
  const [restoredIdLoaded, setRestoredIdLoaded] = useState(false)

  useEffect(() => {
    window.api
      .getSetting('last_fiscal_year_id')
      .then((id: unknown) => {
        if (typeof id === 'number') setRestoredId(id)
      })
      .catch((err: unknown) => {
        console.warn(
          '[FiscalYearContext] Kunde inte läsa last_fiscal_year_id:',
          err,
        )
      })
      .finally(() => {
        setRestoredIdLoaded(true)
      })
  }, [])

  const activeFiscalYear = useMemo(() => {
    if (selectedYear) {
      // Always use the latest version from allFiscalYears to pick up is_closed changes
      return (
        allFiscalYears.find((fy) => fy.id === selectedYear.id) ?? selectedYear
      )
    }
    if (restoredId) {
      const restored = allFiscalYears.find((fy) => fy.id === restoredId)
      if (restored) return restored
    }
    const openYear = allFiscalYears.find((fy) => fy.is_closed === 0)
    return openYear ?? allFiscalYears[0] ?? null
  }, [selectedYear, restoredId, allFiscalYears])

  const setActiveFiscalYear = useCallback((fy: FiscalYear) => {
    setSelectedYear(fy)
    window.api.setSetting('last_fiscal_year_id', fy.id)
  }, [])

  // Persist auto-selected FY to settings so backend IPC handlers can find it
  useEffect(() => {
    if (activeFiscalYear && !selectedYear && !restoredId && restoredIdLoaded) {
      window.api.setSetting('last_fiscal_year_id', activeFiscalYear.id)
    }
  }, [activeFiscalYear, selectedYear, restoredId, restoredIdLoaded])

  const isReadOnly = activeFiscalYear?.is_closed === 1

  const value = useMemo<FiscalYearContextValue>(
    () => ({
      activeFiscalYear,
      setActiveFiscalYear,
      allFiscalYears,
      isReadOnly,
    }),
    [activeFiscalYear, setActiveFiscalYear, allFiscalYears, isReadOnly],
  )

  return (
    <FiscalYearContext.Provider value={value}>
      {children}
    </FiscalYearContext.Provider>
  )
}

/**
 * Optional-variant — returnerar `null` om ingen provider finns istället
 * för att kasta. Används av komponenter som kan rendreras både inom och
 * utanför provider-trädet (t.ex. AppTopBar i tester).
 */
export function useFiscalYearContextOptional(): FiscalYearContextValue | null {
  return useContext(FiscalYearContext)
}

export function useFiscalYearContext(): FiscalYearContextValue {
  const ctx = useContext(FiscalYearContext)
  if (!ctx) {
    throw new Error(
      'useFiscalYearContext måste användas inom FiscalYearProvider',
    )
  }
  return ctx
}
