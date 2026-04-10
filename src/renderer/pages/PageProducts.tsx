import { useState } from 'react'
import { ProductList } from '../components/products/ProductList'
import { ProductDetail } from '../components/products/ProductDetail'
import { ProductForm } from '../components/products/ProductForm'
import { EntityListPage } from '../components/layout/EntityListPage'
import { useProduct } from '../lib/hooks'
import { useMasterDetailNavigation } from '../lib/use-route-navigation'

type TypeFilter = 'service' | 'goods' | 'expense' | undefined

const TYPE_PILLS: { label: string; value: TypeFilter }[] = [
  { label: 'Alla', value: undefined },
  { label: 'Tjänster', value: 'service' },
  { label: 'Varor', value: 'goods' },
  { label: 'Utlägg', value: 'expense' },
]

function EditForm({
  editId,
  onClose,
  onSaved,
}: {
  editId: number
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const { data: product } = useProduct(editId)
  if (!product) return null
  return (
    <ProductForm
      product={product}
      onClose={onClose}
      onSaved={onSaved}
      key={`edit-${editId}`}
    />
  )
}

function TypeFilterPills({
  typeFilter,
  setTypeFilter,
}: {
  typeFilter: TypeFilter
  setTypeFilter: (v: TypeFilter) => void
}) {
  return (
    <div className="flex gap-1 border-b px-4 py-2">
      {TYPE_PILLS.map((pill) => (
        <button
          key={pill.label}
          type="button"
          onClick={() => setTypeFilter(pill.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            typeFilter === pill.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {pill.label}
        </button>
      ))}
    </div>
  )
}

export function PageProducts() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(undefined)
  const navigation = useMasterDetailNavigation('/products')

  return (
    <EntityListPage
      variant="master-detail"
      title="Artiklar & Priser"
      createLabel="Ny artikel"
      searchPlaceholder="Sök artikel..."
      emptyStateMessage="Välj en artikel i listan till vänster"
      navigation={navigation}
      extraFilters={
        <TypeFilterPills
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
        />
      }
      renderList={({ debouncedSearch, selectedId, onSelect }) => (
        <ProductList
          selectedId={selectedId}
          onSelect={onSelect}
          search={debouncedSearch}
          typeFilter={typeFilter}
        />
      )}
      renderDetail={({ id, onEdit }) => (
        <ProductDetail id={id} onEdit={onEdit} />
      )}
      renderForm={({ editId, onClose, onSaved }) =>
        editId !== null ? (
          <EditForm editId={editId} onClose={onClose} onSaved={onSaved} />
        ) : (
          <ProductForm onClose={onClose} onSaved={onSaved} />
        )
      }
    />
  )
}
