import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { VardagShell } from './VardagShell'
import { VardagPageOverview } from './VardagPageOverview'

/**
 * Sprint 17 — VardagApp (ADR 005).
 *
 * Top-level wrapper för Vardag-läget. Konsumerar ActiveCompanyContext
 * (ärvd från App.tsx) och renderar VardagShell + initial page.
 *
 * MVP-routing: bara VardagPageOverview. Sprint 18+ inför Vardag-routing
 * (`#/v/inbox`, `#/v/spend`, etc.) när det finns mer än en sida.
 */
export function VardagApp() {
  const { activeCompany } = useActiveCompany()

  if (!activeCompany) {
    return null
  }

  return (
    <VardagShell companyName={activeCompany.name}>
      <VardagPageOverview />
    </VardagShell>
  )
}
