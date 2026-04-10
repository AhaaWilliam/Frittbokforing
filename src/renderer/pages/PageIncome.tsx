import { useDraftInvoice } from '../lib/hooks'
import { InvoiceList } from '../components/invoices/InvoiceList'
import { InvoiceForm } from '../components/invoices/InvoiceForm'
import { PageHeader } from '../components/layout/PageHeader'
import { EntityListPage, type SubViewNav } from '../components/layout/EntityListPage'
import { useSubViewNavigation } from '../lib/use-route-navigation'

function EditView({
  id,
  onSave,
  onCancel,
}: {
  id: number
  onSave: () => void
  onCancel: () => void
}) {
  const { data: draft, isLoading } = useDraftInvoice(id)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Laddar utkast...
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Utkast hittades inte.
      </div>
    )
  }

  return <InvoiceForm draft={draft} onSave={onSave} onCancel={onCancel} />
}

function ViewInvoice({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: invoice, isLoading } = useDraftInvoice(id)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Laddar faktura...
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Faktura hittades inte.
      </div>
    )
  }

  return <InvoiceForm draft={invoice} onSave={onBack} onCancel={onBack} />
}

function navToNavigate(nav: SubViewNav) {
  return (target: 'form' | { edit: number } | { view: number }) => {
    if (target === 'form') nav.goToCreate()
    else if ('edit' in target) nav.goToEdit(target.edit)
    else nav.goToView(target.view)
  }
}

export function PageIncome() {
  const navigation = useSubViewNavigation('/income')

  return (
    <EntityListPage
      variant="sub-view"
      title="Pengar in"
      createLabel="Ny faktura"
      createTitle="Ny faktura (utkast)"
      navigation={navigation}
      subViews={{
        list: (nav) => (
          <InvoiceList onNavigate={navToNavigate(nav)} />
        ),
        create: (nav) => (
          <InvoiceForm onSave={nav.goToList} onCancel={nav.goToList} />
        ),
        edit: (id, nav) => (
          <EditView id={id} onSave={nav.goToList} onCancel={nav.goToList} />
        ),
        view: (id, nav) => (
          <div className="flex flex-1 flex-col overflow-auto">
            <PageHeader
              title="Visa faktura"
              action={
                <button
                  type="button"
                  onClick={nav.goToList}
                  className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  &larr; Tillbaka
                </button>
              }
            />
            <ViewInvoice id={id} onBack={nav.goToList} />
          </div>
        ),
      }}
    />
  )
}
