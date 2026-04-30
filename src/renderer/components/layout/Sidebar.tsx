import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Calculator,
  Download,
  Settings,
  Users,
  Package,
  FileText,
  BarChart3,
  BookOpen,
  ScrollText,
  Truck,
  Clock,
  PiggyBank,
  CalendarClock,
  Upload,
  Building2,
  Banknote,
  CreditCard,
  LogOut,
  UserCog,
  type LucideIcon,
} from 'lucide-react'
import type { Company } from '../../../shared/types'
import { Link } from '../../lib/router'
import { YearPicker } from './YearPicker'
import { MonthIndicator } from './MonthIndicator'
import { GlobalSearch } from './GlobalSearch'
import { CompanySwitcher } from './CompanySwitcher'
import { SessionTimeoutBadge } from './SessionTimeoutBadge'
import { SectionLabel } from '../ui/SectionLabel'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useInvoiceList, useExpenses, useCounterparties } from '../../lib/hooks'

interface SidebarProps {
  company: Company
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  testId,
  count,
}: {
  to: string
  icon: LucideIcon
  label: string
  testId?: string
  /**
   * Sprint H+G-15 — räknare som visas till höger (eg. utkast/total).
   * Undefined → ingen räknare. 0 → räknare visas (med faint färg).
   */
  count?: number
}) {
  return (
    <Link
      to={to}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      activeClassName="bg-accent text-accent-foreground font-medium"
      testId={testId}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {count != null && (
        <span
          className={`font-mono text-xs ${
            count > 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-faint)]'
          }`}
          data-testid={testId ? `${testId}-count` : undefined}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

export function Sidebar({ company }: SidebarProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const fyId = activeFiscalYear?.id

  // Räknare för sidebar-rader. Undefined skickas tills FY-data resolverat.
  const { data: invoiceData } = useInvoiceList(fyId, { limit: 1 })
  const { data: expenseData } = useExpenses(fyId, { limit: 1 })
  const { data: customers } = useCounterparties({ type: 'customer' })
  const { data: suppliers } = useCounterparties({ type: 'supplier' })

  const invoiceCount = invoiceData?.counts?.total
  const expenseCount = expenseData?.counts?.total
  const customerCount = customers?.length
  const supplierCount = suppliers?.length

  return (
    <aside
      className="flex h-full flex-col border-r border-[var(--border-default)] bg-[var(--surface-secondary)]"
      data-testid="zone-vad"
    >
      {/* Header */}
      <div className="border-b px-4 pb-4 pt-4">
        <CompanySwitcher />
        <div className="px-2 text-xs text-muted-foreground">
          {company.fiscal_rule === 'K2' ? 'Förenklad (K2)' : 'Fullständig (K3)'}
        </div>
        <YearPicker />
        <MonthIndicator />
      </div>

      {/* Search */}
      <GlobalSearch />

      {/* Nav */}
      <nav id="primary-nav" className="flex-1 overflow-y-auto px-2 py-3">
        <SectionLabel className="mb-1 px-3">Hantera</SectionLabel>
        <SidebarLink
          to="/overview"
          icon={LayoutDashboard}
          label="Översikt"
          testId="nav-overview"
        />
        <SidebarLink
          to="/income"
          icon={ArrowDownCircle}
          label="Pengar in"
          testId="nav-income"
          count={invoiceCount}
        />
        <SidebarLink
          to="/expenses"
          icon={ArrowUpCircle}
          label="Pengar ut"
          testId="nav-expenses"
          count={expenseCount}
        />
        <SidebarLink
          to="/manual-entries"
          icon={FileText}
          label="Bokföringsorder"
          testId="nav-manual-entries"
        />
        <SidebarLink
          to="/accruals"
          icon={CalendarClock}
          label="Periodiseringar"
          testId="nav-accruals"
        />
        <SidebarLink
          to="/fixed-assets"
          icon={Building2}
          label="Anläggningstillgångar"
          testId="nav-fixed-assets"
        />
        <SidebarLink
          to="/bank-statements"
          icon={Banknote}
          label="Bankavstämning"
          testId="nav-bank-statements"
        />

        <SectionLabel className="mb-1 mt-4 px-3">Register</SectionLabel>
        <SidebarLink
          to="/customers"
          icon={Users}
          label="Kunder"
          testId="nav-customers"
          count={customerCount}
        />
        <SidebarLink
          to="/suppliers"
          icon={Truck}
          label="Leverantörer"
          testId="nav-suppliers"
          count={supplierCount}
        />
        <SidebarLink
          to="/products"
          icon={Package}
          label="Artiklar & Priser"
          testId="nav-products"
        />

        <SectionLabel className="mb-1 mt-4 px-3">Stamdata</SectionLabel>
        <SidebarLink
          to="/accounts"
          icon={BookOpen}
          label="Kontoplan"
          testId="nav-accounts"
        />

        <SectionLabel className="mb-1 mt-4 px-3">Rapporter</SectionLabel>
        <SidebarLink
          to="/reports"
          icon={BarChart3}
          label="Rapporter"
          testId="nav-reports"
        />
        <SidebarLink
          to="/account-statement"
          icon={ScrollText}
          label="Kontoutdrag"
          testId="nav-account-statement"
        />
        <SidebarLink
          to="/imported-entries"
          icon={Upload}
          label="Importerade verifikat"
          testId="nav-imported-entries"
        />
        <SidebarLink
          to="/aging"
          icon={Clock}
          label="Åldersanalys"
          testId="nav-aging"
        />
        <SidebarLink
          to="/budget"
          icon={PiggyBank}
          label="Budget"
          testId="nav-budget"
        />
        <SidebarLink to="/vat" icon={Receipt} label="Moms" testId="nav-vat" />
        <SidebarLink
          to="/tax"
          icon={Calculator}
          label="Skatt"
          testId="nav-tax"
        />

        <SectionLabel className="mb-1 mt-4 px-3">Övrigt</SectionLabel>
        <SidebarLink
          to="/export"
          icon={Download}
          label="Exportera"
          testId="nav-export"
        />
        <SidebarLink
          to="/import"
          icon={Upload}
          label="Importera SIE"
          testId="nav-import"
        />
        <SidebarLink
          to="/sepa-dd"
          icon={CreditCard}
          label="Autogiro (SEPA DD)"
          testId="nav-sepa-dd"
        />
      </nav>

      {/* Footer */}
      <div className="border-t px-2 py-2">
        <SessionTimeoutBadge />
        <SidebarLink
          to="/settings"
          icon={Settings}
          label="Inställningar"
          testId="nav-settings"
        />
        <SwitchUserButton />
        <LogoutButton />
      </div>
    </aside>
  )
}

async function lockAndReload() {
  await window.auth.logout()
  window.location.reload()
}

function SwitchUserButton() {
  return (
    <button
      type="button"
      data-testid="nav-switch-user"
      onClick={lockAndReload}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <UserCog className="h-4 w-4" aria-hidden="true" />
      Byt användare
    </button>
  )
}

function LogoutButton() {
  return (
    <button
      type="button"
      data-testid="nav-logout"
      onClick={async () => {
        await window.auth.logout()
        // Reload the renderer so React state (contexts, cached query data)
        // resets before LockScreen shows. Cheaper and safer than trying to
        // thread a logout callback through every provider.
        window.location.reload()
      }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Logga ut
    </button>
  )
}
