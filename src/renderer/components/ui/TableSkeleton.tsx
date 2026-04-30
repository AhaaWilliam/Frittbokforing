/**
 * Sprint 88 — Tabell-skeleton primitive.
 *
 * Visar shimmer-blocks i N rader × M kolumner medan list-data laddas.
 * Förhindrar layout-shift när data anländer (skeleton-rader är samma
 * höjd som riktiga rader: py-3 + text-sm = ~40px). Ersätter centrerad
 * LoadingSpinner i listor — användaren ser tabellens form direkt
 * istället för en spinner i tomrum.
 *
 * Animation: pulse-shimmer via Tailwind `animate-pulse`. Token-baserade
 * neutrala färger (bg-muted) för att matcha aktiv design-system-tema.
 *
 * `aria-busy` + role för screen readers — annonserar laddningsstatus
 * utan att förlita sig på visuell shimmer.
 */

interface TableSkeletonProps {
  /** Antal rader att rendera. Default 5 (typiskt list-prefix synligt). */
  rows?: number
  /** Antal kolumner. Skeleton-bredder fördelas jämnt. */
  columns: number
  /** Inkludera select-kolumn (smal checkbox) som första kol. */
  withSelectColumn?: boolean
  /** Synonym för screen reader. Default: "Laddar lista". */
  ariaLabel?: string
}

export function TableSkeleton({
  rows = 5,
  columns,
  withSelectColumn = false,
  ariaLabel = 'Laddar lista',
}: TableSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      aria-busy="true"
      className="w-full"
      data-testid="table-skeleton"
    >
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b">
              {withSelectColumn && (
                <td className="px-3 py-3 w-8">
                  <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                </td>
              )}
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div
                    className="h-4 rounded bg-muted animate-pulse"
                    style={{
                      width: `${50 + ((r * 17 + c * 23) % 40)}%`,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="sr-only">{ariaLabel}</span>
    </div>
  )
}
