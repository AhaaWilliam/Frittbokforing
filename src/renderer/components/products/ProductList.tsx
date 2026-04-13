import type { Product } from '../../../shared/types'
import { useProducts } from '../../lib/hooks'
import { formatKr, unitLabel } from '../../lib/format'

interface ProductListProps {
  selectedId: number | null
  onSelect: (id: number) => void
  search: string
  typeFilter: string | undefined
}

function typeBadge(articleType: Product['article_type']) {
  switch (articleType) {
    case 'service':
      return (
        <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700">
          Tj&auml;nst
        </span>
      )
    case 'goods':
      return (
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
          Vara
        </span>
      )
    case 'expense':
      return (
        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
          Utl&auml;gg
        </span>
      )
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
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        Laddar...
      </div>
    )
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
              selectedId === product.id ? 'bg-blue-50' : ''
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
