import { useNavigate, useRoute } from '../../lib/router'

/**
 * Sprint 22 — Vardag bottom-nav.
 *
 * Fyra primära flöden i Vardag-läget. Bottom-nav är touch-vänligare
 * och passar mode:ns enklare modell (inga djupa sidotrad).
 *
 * Aktiv flik markeras visuellt + via aria-current="page" för screen
 * readers. Tab-ordning följer DOM (Inbox → Spend → Income → Status).
 */

interface NavItem {
  id: 'inbox' | 'spend' | 'income' | 'status'
  label: string
  path: string
  icon: React.ReactNode
}

const ITEMS: ReadonlyArray<NavItem> = [
  {
    id: 'inbox',
    label: 'Inkorg',
    path: '/v/inbox',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    ),
  },
  {
    id: 'spend',
    label: 'Kostnad',
    path: '/v/spend',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
  {
    id: 'income',
    label: 'Faktura',
    path: '/v/income',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    path: '/v/status',
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
  },
]

export function VardagBottomNav() {
  const { path } = useRoute()
  const navigate = useNavigate()

  return (
    <nav
      className="flex items-center justify-around border-t border-[var(--border-default)] bg-[var(--surface-elevated)] px-2 py-2"
      aria-label="Huvudnavigation"
      data-testid="vardag-bottom-nav"
    >
      {ITEMS.map((item) => {
        const isActive = path === item.path
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              isActive
                ? 'text-brand-600'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
            data-testid={`vardag-nav-${item.id}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
