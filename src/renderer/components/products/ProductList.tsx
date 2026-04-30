import type { Product } from '../../../shared/types'
import { useProducts } from '../../lib/hooks'
import { formatKr, unitLabel } from '../../lib/format'
import { Pill } from '../ui/Pill'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface ProductListProps {
  selectedId: number | null
  onSelect: (id: number) => void
  search: string
  typeFilter: string | undefined
}

function typeBadge(articleType: Product['article_type']) {
  switch (articleType) {
    case 'service':
      return <Pill variant="info">Tjänst</Pill>
    case 'goods':
      return <Pill variant="brand">Vara</Pill>
    case 'expense':
      return <Pill variant="warning">Utlägg</Pill>
  }
}

export function ProductList({
  selectedId,
  onSelect,
  search,
  typeFilter,
}: ProductListProps) {
  const { data: products, isLoading } = useProducts({
    search,
    type: typeFilter,
    active_only: true,
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!products || products.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        Inga artiklar hittade
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {products.map((product) => (
        <li key={product.id}>
          <button
            type="button"
            onClick={() => onSelect(product.id)}
            className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
              selectedId === product.id ? 'bg-selected' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {product.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {formatKr(product.default_price_ore)}/{unitLabel(product.unit)}
              </div>
            </div>
            {typeBadge(product.article_type)}
          </button>
        </li>
      ))}
    </ul>
  )
}
