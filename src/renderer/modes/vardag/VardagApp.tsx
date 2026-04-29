import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { HashRouter, useRoute } from '../../lib/router'
import { VardagShell } from './VardagShell'
import { VardagPageInbox } from './VardagPageInbox'
import { VardagPageSpend } from './VardagPageSpend'
import { VardagPageIncome } from './VardagPageIncome'
import { VardagPageStatus } from './VardagPageStatus'
import { vardagRoutes, VARDAG_FALLBACK } from './vardag-routes'

/**
 * Sprint 17 — VardagApp.
 * Sprint 22 — Routing utbyggd: fyra primära Vardag-pages med
 * HashRouter-instans dedikerad åt Vardag-läget.
 *
 * Vardag-routes använder prefix `/v/` för att inte krocka med
 * Bokförar-routerns paths. Vid mode-byte initieras hashen om till
 * respektive default — Bokförare faller till `/overview`, Vardag
 * faller till `/v/inbox`.
 */

function VardagPageContent() {
  const { page } = useRoute()
  switch (page) {
    case 'v-inbox':
      return <VardagPageInbox />
    case 'v-spend':
      return <VardagPageSpend />
    case 'v-income':
      return <VardagPageIncome />
    case 'v-status':
      return <VardagPageStatus />
    default:
      return <VardagPageInbox />
  }
}

export function VardagApp() {
  const { activeCompany } = useActiveCompany()

  if (!activeCompany) {
    return null
  }

  return (
    <HashRouter routes={[...vardagRoutes]} fallback={VARDAG_FALLBACK}>
      <VardagShell companyName={activeCompany.name}>
        <VardagPageContent />
      </VardagShell>
    </HashRouter>
  )
}
