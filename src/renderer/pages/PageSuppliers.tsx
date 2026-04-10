import { ContactList } from '../components/customers/ContactList'
import { CustomerDetail } from '../components/customers/CustomerDetail'
import { CustomerForm } from '../components/customers/CustomerForm'
import { EntityListPage } from '../components/layout/EntityListPage'
import { useCounterparty } from '../lib/hooks'
import { useMasterDetailNavigation } from '../lib/use-route-navigation'

function EditForm({
  editId,
  onClose,
  onSaved,
}: {
  editId: number
  onClose: () => void
  onSaved: (id: number) => void
}) {
  const { data: counterparty } = useCounterparty(editId)
  if (!counterparty) return null
  return (
    <CustomerForm
      counterparty={counterparty}
      onClose={onClose}
      onSaved={onSaved}
      key={`edit-${editId}`}
    />
  )
}

export function PageSuppliers() {
  const navigation = useMasterDetailNavigation('/suppliers')

  return (
    <EntityListPage
      variant="master-detail"
      title="Leverantörer"
      createLabel="Ny leverantör"
      searchPlaceholder="Sök leverantör..."
      emptyStateMessage="Välj en leverantör i listan till vänster"
      navigation={navigation}
      renderList={({ debouncedSearch, selectedId, onSelect }) => (
        <ContactList
          type="supplier"
          search={debouncedSearch}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      renderDetail={({ id, onEdit }) => (
        <CustomerDetail id={id} onEdit={onEdit} />
      )}
      renderForm={({ editId, onClose, onSaved }) =>
        editId !== null ? (
          <EditForm editId={editId} onClose={onClose} onSaved={onSaved} />
        ) : (
          <CustomerForm
            onClose={onClose}
            onSaved={onSaved}
            defaultType="supplier"
          />
        )
      }
    />
  )
}
