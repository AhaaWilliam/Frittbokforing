interface MetricCardProps {
  label: string
  value?: string
  sublabel?: string
  isLoading?: boolean
  variant?: 'default' | 'positive' | 'negative'
  /**
   * Om definierad renderas kortet som `<button>` (fokuserbart + Enter-
   * aktivering). Utelämnas → presentational `<div>`. Sprint J F49-c2.
   */
  onClick?: () => void
}

export function MetricCard({
  label,
  value,
  sublabel,
  isLoading = false,
  variant = 'default',
  onClick,
}: MetricCardProps) {
  const valueClass =
    variant === 'positive'
      ? 'text-green-600'
      : variant === 'negative'
        ? 'text-red-600'
        : ''

  const content = (
    <>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {isLoading && value === undefined ? (
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p className={`text-xl font-medium ${valueClass}`}>{value ?? '–'}</p>
      )}
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg bg-muted/50 p-4 text-left transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {content}
      </button>
    )
  }

  return <div className="rounded-lg bg-muted/50 p-4">{content}</div>
}
