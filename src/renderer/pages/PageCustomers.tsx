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

export function PageCustomers() {
  const navigation = useMasterDetailNavigation('/customers')

  return (
    <EntityListPage
      variant="master-detail"
      title="Kunder"
      createLabel="Ny kund"
      searchPlaceholder="Sök kund..."
      emptyStateMessage="Välj en kund i listan till vänster"
      navigation={navigation}
      renderList={({ debouncedSearch, selectedId, onSelect }) => (
        <ContactList
          type="customer"
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
          <CustomerForm onClose={onClose} onSaved={onSaved} />
        )
      }
    />
  )
}
