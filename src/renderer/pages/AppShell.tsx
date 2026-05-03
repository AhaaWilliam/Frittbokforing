import { useEffect, useMemo, useState } from 'react'
import type { Company } from '../../shared/types'
import { FiscalYearProvider } from '../contexts/FiscalYearContext'
import { ActivePeriodProvider } from '../contexts/ActivePeriodContext'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'
import { SkipLinksProvider } from '../contexts/SkipLinksContext'
import { useRoute, useNavigate } from '../lib/router'
import { Sidebar } from '../components/layout/Sidebar'
import { AppTopBar } from '../components/layout/AppTopBar'
import { ZoneCons } from '../components/layout/ZoneCons'
import { StatusNu } from '../components/zone-cons/StatusNu'
import { SkipLinks } from '../components/layout/SkipLinks'
import { ReadOnlyBanner } from '../components/layout/ReadOnlyBanner'
import { CommandPalette } from '../components/command-palette/CommandPalette'
import {
  buildBokforareCommands,
  buildSystemCommands,
  buildRecentItemsCommands,
  type RecentItem,
} from '../components/command-palette/commands'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { isAnyModalOpen } from '../lib/is-modal-open'
import { useUiMode } from '../lib/use-ui-mode'
import {
  useDraftInvoices,
  useExpenseDrafts,
  useReTransferOpeningBalance,
} from '../lib/hooks'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { toast } from 'sonner'
import { PageOverview } from './PageOverview'
import { PageIncome } from './PageIncome'
import { PageExpenses } from './PageExpenses'
import { PageVat } from './PageVat'
import { PageTax } from './PageTax'
import { PageExport } from './PageExport'
import { PageSettings } from './PageSettings'
import { PageCustomers } from './PageCustomers'
import { PageProducts } from './PageProducts'
import { PageManualEntries } from './PageManualEntries'
import { PageImportedEntries } from './PageImportedEntries'
import { PageReports } from './PageReports'
import { PageAccounts } from './PageAccounts'
import { PageSuppliers } from './PageSuppliers'
import { PageAccountStatement } from './PageAccountStatement'
import { PageAgingReport } from './PageAgingReport'
import { PageBudget } from './PageBudget'
import { PageAccruals } from './PageAccruals'
import { PageFixedAssets } from './PageFixedAssets'
import { PageImport } from './PageImport'
import { PageBankStatements } from './PageBankStatements'
import { PageSepaDd } from './PageSepaDd'
import { PageInbox } from './PageInbox'

interface AppShellInnerProps {
  company: Company
}

function PageContent({ page }: { page: string }) {
  switch (page) {
    case 'overview':
      return <PageOverview />
    case 'income':
      return <PageIncome />
    case 'expenses':
      return <PageExpenses />
    case 'vat':
      return <PageVat />
    case 'tax':
      return <PageTax />
    case 'reports':
      return <PageReports />
    case 'export':
      return <PageExport />
    case 'settings':
      return <PageSettings />
    case 'customers':
      return <PageCustomers />
    case 'products':
      return <PageProducts />
    case 'manual-entries':
      return <PageManualEntries />
    case 'imported-entries':
      return <PageImportedEntries />
    case 'accounts':
      return <PageAccounts />
    case 'suppliers':
      return <PageSuppliers />
    case 'account-statement':
      return <PageAccountStatement />
    case 'aging':
      return <PageAgingReport />
    case 'budget':
      return <PageBudget />
    case 'accruals':
      return <PageAccruals />
    case 'fixed-assets':
      return <PageFixedAssets />
    case 'import':
      return <PageImport />
    case 'bank-statements':
      return <PageBankStatements />
    case 'sepa-dd':
      return <PageSepaDd />
    case 'inbox':
      return <PageInbox />
    default:
      return <PageOverview />
  }
}

function AppShellInner({ company }: AppShellInnerProps) {
  const { page } = useRoute()
  const navigate = useNavigate()
  const { setMode } = useUiMode()
  const { activeFiscalYear } = useFiscalYearContext()
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Sprint 27 — recent-items command-builder
  const { data: invoiceDrafts } = useDraftInvoices(activeFiscalYear?.id)
  const { data: expenseDrafts } = useExpenseDrafts(activeFiscalYear?.id)
  const reTransferIB = useReTransferOpeningBalance()

  const recentItems = useMemo<RecentItem[]>(() => {
    const items: RecentItem[] = []
    // Top 5 utkast-fakturor
    for (const inv of (invoiceDrafts ?? []).slice(0, 5)) {
      items.push({
        id: `inv-draft-${inv.id}`,
        label: `Faktura-utkast — ${inv.counterparty_name || 'okänd kund'}`,
        keywords: ['utkast', 'faktura', inv.counterparty_name],
        path: `/income/edit/${inv.id}`,
      })
    }
    // Top 5 utkast-kostnader
    for (const exp of (expenseDrafts ?? []).slice(0, 5)) {
      items.push({
        id: `exp-draft-${exp.id}`,
        label: `Kostnads-utkast — ${exp.counterparty_name || 'okänd leverantör'}`,
        keywords: ['utkast', 'kostnad', exp.counterparty_name],
        path: `/expenses/edit/${exp.id}`,
      })
    }
    return items
  }, [invoiceDrafts, expenseDrafts])

  // Sprint 15 — ⌘K command palette + Sprint 17/27 system + view commands
  const commands = useMemo(
    () => [
      ...buildBokforareCommands(navigate),
      ...buildRecentItemsCommands(navigate, recentItems),
      ...buildSystemCommands({
        switchToVardag: () => setMode('vardag'),
        createBackup: async () => {
          try {
            const result = await window.api.backupCreate()
            if (result.filePath) {
              toast.success(`Säkerhetskopia sparad: ${result.filePath}`)
            }
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : 'Säkerhetskopiering misslyckades',
            )
          }
        },
        reTransferOpeningBalance: () => {
          if (!activeFiscalYear) {
            toast.error('Inget aktivt räkenskapsår')
            return
          }
          reTransferIB.mutate(undefined, {
            onSuccess: () => toast.success('Ingående balans återöverförd'),
          })
        },
      }),
    ],
    [navigate, recentItems, setMode, activeFiscalYear, reTransferIB],
  )
  useKeyboardShortcuts({
    'mod+k': () => {
      // VS-105: Om palette redan är öppen, låt mod+k stänga den (toggle).
      // Om någon annan modal är öppen, skippa — annars skulle palette
      // poppa upp bakom modal och stjäla fokus.
      if (paletteOpen) {
        setPaletteOpen(false)
        return
      }
      if (isAnyModalOpen()) return
      setPaletteOpen(true)
    },
    'mod+shift+b': () => setMode('vardag'),
  })

  useEffect(() => {
    document.title = `Fritt Bokföring — ${company.name}`
  }, [company.name])

  return (
    <div className="flex h-screen flex-col" data-testid="app-ready">
      <SkipLinks />
      <AppTopBar companyName={company.name} />
      <div className="grid flex-1 grid-cols-[240px_1fr_360px] overflow-hidden">
        <Sidebar company={company} />
        <main
          id="main-content"
          aria-label="Huvudinnehåll"
          className="flex flex-col overflow-hidden bg-[var(--surface-elevated)]"
        >
          <ReadOnlyBanner />
          <div
            className="flex flex-1 flex-col overflow-hidden"
            data-testid={`page-${page}`}
          >
            <PageContent page={page} />
          </div>
        </main>
        <ZoneCons>
          <StatusNu />
        </ZoneCons>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        mode="bokforare"
      />
    </div>
  )
}

export function AppShell() {
  const { activeCompany } = useActiveCompany()

  if (!activeCompany) {
    // Övergångstillstånd: ActiveCompanyContext har laddat 0 bolag.
    // App.tsx triggar wizard innan vi når hit, så detta är defensiv null.
    return null
  }

  return (
    <SkipLinksProvider>
      {/* Sprint MC2: re-mount FiscalYearProvider vid bolagsbyte så att
          restoredId-state nollställs och senast valda FY för nya bolaget
          läses från settings. VS-140: HashRouter ligger i App.tsx ovanpå
          ModeRouter, inte här. */}
      <FiscalYearProvider key={activeCompany.id}>
        {/* VS-144: ActivePeriodProvider — pages med egen period-picker
            kan registrera vald period via useSetActivePeriod. Default
            (null) = MonthIndicator härleder från global FY (oförändrat). */}
        <ActivePeriodProvider>
          <AppShellInner company={activeCompany} />
        </ActivePeriodProvider>
      </FiscalYearProvider>
    </SkipLinksProvider>
  )
}
