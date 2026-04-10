interface MetricCardProps {
  label: string
  value?: string
  sublabel?: string
  isLoading?: boolean
  variant?: 'default' | 'positive' | 'negative'
}

export function MetricCard({
  label,
  value,
  sublabel,
  isLoading = false,
  variant = 'default',
}: MetricCardProps) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {isLoading && value === undefined ? (
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <p
          className={`text-xl font-medium ${
            variant === 'positive'
              ? 'text-green-600'
              : variant === 'negative'
                ? 'text-red-600'
                : ''
          }`}
        >
          {value ?? '–'}
        </p>
      )}
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  )
}
