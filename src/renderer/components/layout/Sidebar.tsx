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

interface SidebarProps {
  company: Company
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  testId,
}: {
  to: string
  icon: LucideIcon
  label: string
  testId?: string
}) {
  return (
    <Link
      to={to}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      activeClassName="bg-accent text-accent-foreground font-medium"
      testId={testId}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}

export function Sidebar({ company }: SidebarProps) {
  return (
    <aside className="flex h-full w-[220px] flex-col border-r bg-muted/30">
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
        />
        <SidebarLink
          to="/expenses"
          icon={ArrowUpCircle}
          label="Pengar ut"
          testId="nav-expenses"
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
        />
        <SidebarLink
          to="/suppliers"
          icon={Truck}
          label="Leverantörer"
          testId="nav-suppliers"
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
