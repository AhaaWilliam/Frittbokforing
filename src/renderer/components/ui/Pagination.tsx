/**
 * Sprint 57 C2a — dum Pagination-komponent.
 *
 * State lever i föräldern (Beslut 11). testIdPrefix är required för
 * att undvika kollision mellan flera listor på samma sida.
 */

export interface PaginationProps {
  /** 0-indexed. */
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  /** t.ex. 'fakturor', 'kostnader', 'transaktioner'. */
  label?: string
  /** Required — måste vara unik per sida (t.ex. 'pag-invoices'). */
  testIdPrefix: string
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  label = 'rader',
  testIdPrefix,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const from = totalItems === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, totalItems)
  const atStart = page === 0
  const atEnd = page >= totalPages - 1

  return (
    <div className="flex items-center justify-between gap-4 border-t px-4 py-2 text-sm">
      <span
        className="text-muted-foreground"
        data-testid={`${testIdPrefix}-summary`}
      >
        Visar {from}–{to} av {totalItems} {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={atStart}
          onClick={() => onPageChange(page - 1)}
          data-testid={`${testIdPrefix}-prev`}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          ‹ Föregående
        </button>
        <span data-testid={`${testIdPrefix}-position`}>
          Sida {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => onPageChange(page + 1)}
          data-testid={`${testIdPrefix}-next`}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >
          Nästa ›
        </button>
      </div>
    </div>
  )
}
