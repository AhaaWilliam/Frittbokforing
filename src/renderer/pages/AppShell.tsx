import { useEffect } from 'react'
import type { Company } from '../../shared/types'
import { FiscalYearProvider } from '../contexts/FiscalYearContext'
import { SkipLinksProvider } from '../contexts/SkipLinksContext'
import { HashRouter, useRoute } from '../lib/router'
import { routes } from '../lib/routes'
import { Sidebar } from '../components/layout/Sidebar'
import { SkipLinks } from '../components/layout/SkipLinks'
import { ReadOnlyBanner } from '../components/layout/ReadOnlyBanner'
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

interface AppShellProps {
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
    default:
      return <PageOverview />
  }
}

function AppShellInner({ company }: AppShellProps) {
  const { page } = useRoute()

  useEffect(() => {
    document.title = `Fritt Bokföring — ${company.name}`
  }, [company.name])

  return (
    <div className="flex h-screen" data-testid="app-ready">
      <SkipLinks />
      <Sidebar company={company} />
      <main
        id="main-content"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <ReadOnlyBanner />
        <div
          className="flex flex-1 flex-col overflow-hidden"
          data-testid={`page-${page}`}
        >
          <PageContent page={page} />
        </div>
      </main>
    </div>
  )
}

export function AppShell({ company }: AppShellProps) {
  return (
    <SkipLinksProvider>
      <FiscalYearProvider>
        <HashRouter routes={routes} fallback="/overview">
          <AppShellInner company={company} />
        </HashRouter>
      </FiscalYearProvider>
    </SkipLinksProvider>
  )
}
