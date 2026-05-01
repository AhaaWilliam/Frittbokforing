import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 gap-4">
      <div className="text-muted-foreground">{icon}</div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        {description}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// Simple inline SVG illustrations
export function InvoiceIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="12"
        y="6"
        width="40"
        height="52"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M22 22h20M22 30h20M22 38h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="44"
        cy="46"
        r="8"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M41 46l2 2 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExpenseIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="10"
        y="14"
        width="44"
        height="36"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M10 24h44" stroke="currentColor" strokeWidth="2" />
      <path
        d="M20 34h10M20 40h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="38"
        y="32"
        width="10"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

export function ManualEntryIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="10"
        y="8"
        width="36"
        height="48"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 20h16M20 28h16M20 36h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M44 32l10 10M54 32l-10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AccountIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="10"
        width="48"
        height="44"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8 22h48M28 22v32" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 32h6M16 40h6M36 32h12M36 40h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function DashboardIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8"
        y="8"
        width="48"
        height="48"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="16"
        y="30"
        width="8"
        height="18"
        rx="1"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="28"
        y="22"
        width="8"
        height="26"
        rx="1"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="40"
        y="16"
        width="8"
        height="32"
        rx="1"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

export function CustomerIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="32" cy="22" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M14 54c0-10 8-16 18-16s18 6 18 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SupplierIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="6"
        y="22"
        width="36"
        height="24"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M42 28h10l6 8v10H42"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="50" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="48" cy="50" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function ProductIllustration() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M32 8l20 10v18l-20 10-20-10V18z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 18l20 10 20-10M32 28v18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
