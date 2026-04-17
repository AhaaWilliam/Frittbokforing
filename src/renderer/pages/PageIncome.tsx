import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { useDraftInvoice } from '../lib/hooks'
import { useIpcMutation } from '../lib/use-ipc-mutation'
import { InvoiceList } from '../components/invoices/InvoiceList'
import { InvoiceForm } from '../components/invoices/InvoiceForm'
import { PageHeader } from '../components/layout/PageHeader'
import {
  EntityListPage,
  type SubViewNav,
} from '../components/layout/EntityListPage'
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

function ViewInvoiceWrapper({
  id,
  onBack,
}: {
  id: number
  onBack: () => void
}) {
  const { data: invoice, isLoading } = useDraftInvoice(id)
  const generatePdfMutation = useIpcMutation((data: { invoiceId: number }) =>
    window.api.generateInvoicePdf(data),
  )

  async function handleDownloadPdf() {
    if (!invoice) return
    try {
      const pdfData = await generatePdfMutation.mutateAsync({
        invoiceId: invoice.id,
      })
      const customerPart = invoice.counterparty_name
        ? `_${invoice.counterparty_name.replace(/[^a-zA-ZåäöÅÄÖ0-9]/g, '_')}`
        : ''
      const fileName = `Faktura_${invoice.invoice_number}${customerPart}.pdf`
      await window.api.saveInvoicePdf({
        data: pdfData.data,
        defaultFileName: fileName,
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Kunde inte generera PDF',
      )
    }
  }

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

  const showPdfButton = invoice.status !== 'draft'

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader
        title="Visa faktura"
        action={
          <div className="flex items-center gap-2">
            {showPdfButton && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={generatePdfMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                {generatePdfMutation.isPending
                  ? 'Genererar...'
                  : 'Ladda ner PDF'}
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              &larr; Tillbaka
            </button>
          </div>
        }
      />
      <InvoiceForm draft={invoice} onSave={onBack} onCancel={onBack} />
    </div>
  )
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
        list: (nav) => <InvoiceList onNavigate={navToNavigate(nav)} />,
        create: (nav) => (
          <InvoiceForm onSave={nav.goToList} onCancel={nav.goToList} />
        ),
        edit: (id, nav) => (
          <EditView id={id} onSave={nav.goToList} onCancel={nav.goToList} />
        ),
        view: (id, nav) => <ViewInvoiceWrapper id={id} onBack={nav.goToList} />,
      }}
    />
  )
}
