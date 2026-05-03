import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

/**
 * VS-144: Active period override för Sidebar/MonthIndicator.
 *
 * Default-läge: ingen override → MonthIndicator härleder aktiv period från
 * global FY (samma beteende som tidigare).
 *
 * Page-override: en page med egen period-picker (framtida wiring i
 * PageBudget/PageVat/PageReports) anropar `setActivePeriodId(id)` i en
 * `useEffect` och returnerar en cleanup som nollar.
 *
 * Provider lever på AppShell-nivå så Sidebar (som lever ovanför pages i
 * trädet) kan läsa overriden via `useActivePeriodId()`.
 */

export interface ActivePeriodContextValue {
  /** Period-id som page vill highlightas i MonthIndicator, eller null = inget override. */
  activePeriodId: number | null
  /** Sätter override. Pages kallar i useEffect; cleanup → setActivePeriodId(null). */
  setActivePeriodId: (id: number | null) => void
}

const ActivePeriodContext = createContext<ActivePeriodContextValue | null>(null)

export function ActivePeriodProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activePeriodId, setActivePeriodId] = useState<number | null>(null)

  const value = useMemo<ActivePeriodContextValue>(
    () => ({ activePeriodId, setActivePeriodId }),
    [activePeriodId],
  )

  return (
    <ActivePeriodContext.Provider value={value}>
      {children}
    </ActivePeriodContext.Provider>
  )
}

/**
 * Optional-variant — returnerar `null` när ingen provider finns. Tillåter
 * MonthIndicator att rendreras både inom och utanför provider-trädet
 * (default-fallback = oförändrat beteende).
 */
export function useActivePeriodOptional(): ActivePeriodContextValue | null {
  return useContext(ActivePeriodContext)
}

/**
 * Throwing-variant för pages som vet att providern finns.
 */
export function useActivePeriod(): ActivePeriodContextValue {
  const ctx = useContext(ActivePeriodContext)
  if (!ctx) {
    throw new Error('useActivePeriod måste användas inom ActivePeriodProvider')
  }
  return ctx
}

/**
 * Hook för pages: sätt override för perioden under komponentens livstid,
 * cleanup nollar automatiskt. No-op om providern saknas (t.ex. i test
 * utan AppShell).
 */
export function useSetActivePeriod(periodId: number | null | undefined): void {
  const ctx = useContext(ActivePeriodContext)
  const setter = ctx?.setActivePeriodId
  const id = periodId ?? null
  const stableSetter = useCallback(
    (value: number | null) => setter?.(value),
    [setter],
  )
  useEffect(() => {
    if (!setter) return
    stableSetter(id)
    return () => stableSetter(null)
  }, [id, setter, stableSetter])
}
