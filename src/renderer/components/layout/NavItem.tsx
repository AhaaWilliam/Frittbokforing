import type { LucideIcon } from 'lucide-react'

interface NavItemProps {
  icon: LucideIcon
  label: string
  isActive: boolean
  onClick: () => void
}

export function NavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
  testId,
}: NavItemProps & { testId?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm ${
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}
