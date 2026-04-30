import { useState } from 'react'
import { Plus, XCircle, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { Callout } from '../components/ui/Callout'
import { BANK_FORETAGSKONTO } from '../../shared/bank-accounts'
import { CustomerPicker } from '../components/invoices/CustomerPicker'
import { useIpcQuery } from '../lib/use-ipc-query'
import { useIpcMutation } from '../lib/use-ipc-mutation'
import { formatKr, kronorToOre, todayLocal } from '../lib/format'
import type {
  SepaMandate,
  SepaCollection,
  SepaSequenceType,
} from '../../main/services/payment/sepa-dd-service'

type TabKey = 'mandates' | 'collections' | 'batches'

interface CollectionRow {
  id: number
  fiscal_year_id: number
  mandate_id: number
  invoice_id: number | null
  amount_ore: number
  collection_date: string
  status: string
  payment_batch_id: number | null
  created_at: string
  mandate_reference: string
  counterparty_id: number
  counterparty_name: string
  invoice_number: number | null
}

interface BatchRow {
  id: number
  fiscal_year_id: number
  payment_date: string
  account_number: string
  status: string
  user_note: string | null
  exported_at: string | null
  export_format: string | null
  export_filename: string | null
  created_at: string
  collection_count: number
  total_amount_ore: number
}

const SEQUENCE_LABELS: Record<SepaSequenceType, string> = {
  OOFF: 'OOFF — Engångsmandat',
  FRST: 'FRST — Första i serie',
  RCUR: 'RCUR — Återkommande',
  FNAL: 'FNAL — Sista i serie',
}

// ─── Hooks ────────────────────────────────────────────────────────────────

function useListMandates(counterpartyId: number | undefined) {
  return useIpcQuery<SepaMandate[]>(
    ['sepa-dd', 'mandates', counterpartyId ?? 'none'],
    () => window.api.sepaDdListMandates({ counterparty_id: counterpartyId! }),
    { enabled: !!counterpartyId },
  )
}

function useListCollections(fiscalYearId: number) {
  return useIpcQuery<CollectionRow[]>(
    ['sepa-dd', 'collections', fiscalYearId],
    () => window.api.sepaDdListCollections({ fiscal_year_id: fiscalYearId }),
  )
}

function useListBatches(fiscalYearId: number) {
  return useIpcQuery<BatchRow[]>(['sepa-dd', 'batches', fiscalYearId], () =>
    window.api.sepaDdListBatches({ fiscal_year_id: fiscalYearId }),
  )
}

function useCreateMandate() {
  return useIpcMutation<
    {
      counterparty_id: number
      mandate_reference: string
      signature_date: string
      sequence_type: SepaSequenceType
      iban: string
      bic?: string | null
    },
    SepaMandate
  >((data) => window.api.sepaDdCreateMandate(data), {
    invalidate: [['sepa-dd', 'mandates']],
  })
}

function useRevokeMandate() {
  return useIpcMutation<{ mandate_id: number }, { id: number }>(
    (data) => window.api.sepaDdRevokeMandate(data),
    { invalidate: [['sepa-dd', 'mandates']] },
  )
}

function useCreateCollection() {
  return useIpcMutation<
    {
      fiscal_year_id: number
      mandate_id: number
      invoice_id?: number | null
      amount_ore: number
      collection_date: string
    },
    SepaCollection
  >((data) => window.api.sepaDdCreateCollection(data), {
    invalidate: [['sepa-dd', 'collections']],
  })
}

function useCreateBatch() {
  return useIpcMutation<
    {
      fiscal_year_id: number
      collection_ids: number[]
      payment_date: string
      account_number: string
      user_note?: string | null
    },
    { batch_id: number; collection_count: number }
  >((data) => window.api.sepaDdCreateBatch(data), {
    invalidate: [
      ['sepa-dd', 'batches'],
      ['sepa-dd', 'collections'],
    ],
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function PageSepaDd() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [tab, setTab] = useState<TabKey>('mandates')

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title="Autogiro (SEPA DD)" />

      <div className="border-b px-6">
        <nav
          role="tablist"
          aria-label="SEPA Direct Debit-sektioner"
          className="flex gap-1"
        >
          <TabButton
            active={tab === 'mandates'}
            onClick={() => setTab('mandates')}
          >
            Mandat
          </TabButton>
          <TabButton
            active={tab === 'collections'}
            onClick={() => setTab('collections')}
          >
            Uppsamlingar
          </TabButton>
          <TabButton
            active={tab === 'batches'}
            onClick={() => setTab('batches')}
          >
            Batcher
          </TabButton>
        </nav>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 pt-4">
        {tab === 'mandates' && <MandatesSection />}
        {tab === 'collections' && (
          <CollectionsSection fiscalYearId={activeFiscalYear.id} />
        )}
        {tab === 'batches' && (
          <BatchesSection fiscalYearId={activeFiscalYear.id} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Mandat ───────────────────────────────────────────────────────────────

function MandatesSection() {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    null,
  )
  const [showForm, setShowForm] = useState(false)
  const mandatesQuery = useListMandates(selected?.id)
  const revokeMutation = useRevokeMandate()

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-4">
        <div className="mb-2 block text-xs font-medium text-muted-foreground">
          Välj kund
        </div>
        <CustomerPicker
          value={selected}
          onChange={(customer) =>
            setSelected(
              customer ? { id: customer.id, name: customer.name } : null,
            )
          }
        />
      </div>

      {selected && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Mandat för {selected.name}</h2>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nytt mandat
          </button>
        </div>
      )}

      {selected && showForm && (
        <CreateMandateForm
          counterpartyId={selected.id}
          onClose={() => setShowForm(false)}
        />
      )}

      {selected && (
        <div className="rounded-md border bg-card">
          {mandatesQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : mandatesQuery.data && mandatesQuery.data.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Referens</th>
                  <th className="px-4 py-2 text-left">Typ</th>
                  <th className="px-4 py-2 text-left">IBAN</th>
                  <th className="px-4 py-2 text-left">Signerat</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {mandatesQuery.data.map((m) => (
                  <MandateRow
                    key={m.id}
                    mandate={m}
                    onRevoke={async () => {
                      if (
                        !confirm(
                          `Återkalla mandat ${m.mandate_reference}? Kan inte ångras.`,
                        )
                      ) {
                        return
                      }
                      try {
                        await revokeMutation.mutateAsync({ mandate_id: m.id })
                        toast.success('Mandat återkallat')
                      } catch (err) {
                        toast.error(
                          err instanceof Error
                            ? err.message
                            : 'Kunde inte återkalla mandat',
                        )
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Inga mandat för vald kund.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MandateRow({
  mandate,
  onRevoke,
}: {
  mandate: SepaMandate
  onRevoke: () => void
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-2 font-mono text-xs">
        {mandate.mandate_reference}
      </td>
      <td className="px-4 py-2">{SEQUENCE_LABELS[mandate.sequence_type]}</td>
      <td className="px-4 py-2 font-mono text-xs">{mandate.iban}</td>
      <td className="px-4 py-2">{mandate.signature_date}</td>
      <td className="px-4 py-2">
        {mandate.status === 'active' ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
            Aktivt
          </span>
        ) : (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Återkallat
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {mandate.status === 'active' && (
          <button
            type="button"
            onClick={onRevoke}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Återkalla
          </button>
        )}
      </td>
    </tr>
  )
}

function CreateMandateForm({
  counterpartyId,
  onClose,
}: {
  counterpartyId: number
  onClose: () => void
}) {
  const [reference, setReference] = useState('')
  const [signatureDate, setSignatureDate] = useState(todayLocal())
  const [sequenceType, setSequenceType] = useState<SepaSequenceType>('RCUR')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateMandate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createMutation.mutateAsync({
        counterparty_id: counterpartyId,
        mandate_reference: reference.trim(),
        signature_date: signatureDate,
        sequence_type: sequenceType,
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        bic: bic.trim() ? bic.trim().toUpperCase() : null,
      })
      toast.success('Mandat skapat')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa mandat')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border bg-card p-4"
      aria-label="Skapa nytt mandat"
    >
      <h3 className="text-sm font-medium">Nytt mandat</h3>
      <FieldRow>
        <FieldBlock label="Mandat-referens">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={35}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
        <FieldBlock label="Signaturdatum">
          <input
            type="date"
            value={signatureDate}
            onChange={(e) => setSignatureDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
      </FieldRow>
      <FieldBlock label="Sekvens-typ">
        <select
          value={sequenceType}
          onChange={(e) => setSequenceType(e.target.value as SepaSequenceType)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          {(['OOFF', 'FRST', 'RCUR', 'FNAL'] as SepaSequenceType[]).map((t) => (
            <option key={t} value={t}>
              {SEQUENCE_LABELS[t]}
            </option>
          ))}
        </select>
      </FieldBlock>
      <FieldRow>
        <FieldBlock label="IBAN">
          <input
            type="text"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="SE35 5000 0000 0549 1000 0003"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
            required
          />
        </FieldBlock>
        <FieldBlock label="BIC (valfri)">
          <input
            type="text"
            value={bic}
            onChange={(e) => setBic(e.target.value)}
            placeholder="HANDSESS"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
          />
        </FieldBlock>
      </FieldRow>

      {error && <Callout variant="danger">{error}</Callout>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createMutation.isPending ? 'Sparar…' : 'Skapa mandat'}
        </button>
      </div>
    </form>
  )
}

// ─── Collections ─────────────────────────────────────────────────────────

function CollectionsSection({ fiscalYearId }: { fiscalYearId: number }) {
  const [showForm, setShowForm] = useState(false)
  const collectionsQuery = useListCollections(fiscalYearId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Uppsamlingar</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ny uppsamling
        </button>
      </div>

      {showForm && (
        <CreateCollectionForm
          fiscalYearId={fiscalYearId}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="rounded-md border bg-card">
        {collectionsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : collectionsQuery.data && collectionsQuery.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Kund</th>
                <th className="px-4 py-2 text-left">Mandat</th>
                <th className="px-4 py-2 text-left">Faktura</th>
                <th className="px-4 py-2 text-left">Datum</th>
                <th className="px-4 py-2 text-right">Belopp</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {collectionsQuery.data.map((c) => (
                <CollectionRowComponent key={c.id} collection={c} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Inga uppsamlingar för räkenskapsåret.
          </div>
        )}
      </div>
    </div>
  )
}

function CollectionRowComponent({ collection }: { collection: CollectionRow }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-2 font-mono text-xs">#{collection.id}</td>
      <td className="px-4 py-2">{collection.counterparty_name}</td>
      <td className="px-4 py-2 font-mono text-xs">
        {collection.mandate_reference}
      </td>
      <td className="px-4 py-2">
        {collection.invoice_number != null
          ? `#${collection.invoice_number}`
          : '—'}
      </td>
      <td className="px-4 py-2">{collection.collection_date}</td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatKr(collection.amount_ore)}
      </td>
      <td className="px-4 py-2">
        <span className="rounded bg-muted px-2 py-0.5 text-xs">
          {collection.status}
        </span>
      </td>
    </tr>
  )
}

function CreateCollectionForm({
  fiscalYearId,
  onClose,
}: {
  fiscalYearId: number
  onClose: () => void
}) {
  const [mandateId, setMandateId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [amountKr, setAmountKr] = useState('')
  const [collectionDate, setCollectionDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateCollection()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const mId = parseInt(mandateId, 10)
    if (!mId) {
      setError('Mandat-ID krävs')
      return
    }
    const amountOre = kronorToOre(amountKr)
    if (amountOre <= 0) {
      setError('Belopp måste vara större än noll')
      return
    }
    const invId = invoiceId.trim() ? parseInt(invoiceId, 10) : null
    try {
      await createMutation.mutateAsync({
        fiscal_year_id: fiscalYearId,
        mandate_id: mId,
        invoice_id: invId,
        amount_ore: amountOre,
        collection_date: collectionDate,
      })
      toast.success('Uppsamling skapad')
      onClose()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Kunde inte skapa uppsamling',
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border bg-card p-4"
      aria-label="Skapa ny uppsamling"
    >
      <h3 className="text-sm font-medium">Ny uppsamling</h3>
      <FieldRow>
        <FieldBlock label="Mandat-ID">
          <input
            type="number"
            min={1}
            value={mandateId}
            onChange={(e) => setMandateId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
        <FieldBlock label="Faktura-ID (valfritt)">
          <input
            type="number"
            min={1}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </FieldBlock>
      </FieldRow>
      <FieldRow>
        <FieldBlock label="Belopp (kr)">
          <input
            type="text"
            inputMode="decimal"
            value={amountKr}
            onChange={(e) => setAmountKr(e.target.value)}
            placeholder="0,00"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
        <FieldBlock label="Uppsamlingsdatum">
          <input
            type="date"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
      </FieldRow>

      {error && <Callout variant="danger">{error}</Callout>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createMutation.isPending ? 'Sparar…' : 'Skapa uppsamling'}
        </button>
      </div>
    </form>
  )
}

// ─── Batcher ─────────────────────────────────────────────────────────────

function BatchesSection({ fiscalYearId }: { fiscalYearId: number }) {
  const [showForm, setShowForm] = useState(false)
  const batchesQuery = useListBatches(fiscalYearId)
  const collectionsQuery = useListCollections(fiscalYearId)

  const pendingCollections =
    collectionsQuery.data?.filter(
      (c) => c.status === 'pending' && c.payment_batch_id == null,
    ) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Batcher</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={pendingCollections.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          title={
            pendingCollections.length === 0
              ? 'Skapa minst en pending uppsamling först'
              : undefined
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ny batch
        </button>
      </div>

      {showForm && (
        <CreateBatchForm
          fiscalYearId={fiscalYearId}
          pendingCollections={pendingCollections}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="rounded-md border bg-card">
        {batchesQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : batchesQuery.data && batchesQuery.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Batch</th>
                <th className="px-4 py-2 text-left">Betalningsdatum</th>
                <th className="px-4 py-2 text-left">Konto</th>
                <th className="px-4 py-2 text-right">Antal</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Export</th>
                <th className="px-4 py-2 text-right">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              {batchesQuery.data.map((b) => (
                <BatchRowComponent key={b.id} batch={b} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Inga batcher för räkenskapsåret.
          </div>
        )}
      </div>
    </div>
  )
}

function BatchRowComponent({ batch }: { batch: BatchRow }) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const result = await window.api.sepaDdExportPain008({
        batch_id: batch.id,
      })
      if (!result.success) {
        toast.error(result.error)
      } else if (result.data.saved) {
        toast.success('pain.008 exporterad')
        // List invalidering sköts av export-handler-effekten via
        // batches-queryn nästa poll; enklast: trigga manuell refetch
        // genom att navigera bort/tillbaka, men för MVP räcker det att
        // exported_at syns vid nästa sidladdning. Alternativt: lägg till
        // invalidate-hook här.
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte exportera pain.008',
      )
    }
    setExporting(false)
  }

  const isExported = batch.exported_at != null

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-2 font-mono text-xs">#{batch.id}</td>
      <td className="px-4 py-2">{batch.payment_date}</td>
      <td className="px-4 py-2 font-mono text-xs">{batch.account_number}</td>
      <td className="px-4 py-2 text-right">{batch.collection_count}</td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatKr(batch.total_amount_ore)}
      </td>
      <td className="px-4 py-2">
        {isExported ? (
          <span
            className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
            title={batch.exported_at ?? undefined}
          >
            Exporterad
          </span>
        ) : (
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Väntar export
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
          {exporting
            ? 'Exporterar…'
            : isExported
              ? 'Exportera igen'
              : 'Exportera pain.008'}
        </button>
      </td>
    </tr>
  )
}

function CreateBatchForm({
  fiscalYearId,
  pendingCollections,
  onClose,
}: {
  fiscalYearId: number
  pendingCollections: CollectionRow[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [paymentDate, setPaymentDate] = useState(todayLocal())
  const [accountNumber, setAccountNumber] = useState<string>(BANK_FORETAGSKONTO)
  const [userNote, setUserNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createMutation = useCreateBatch()

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (selected.size === 0) {
      setError('Välj minst en uppsamling')
      return
    }
    if (!accountNumber.trim()) {
      setError('Kontonummer krävs')
      return
    }
    const ids = Array.from(selected)
    try {
      const result = await createMutation.mutateAsync({
        fiscal_year_id: fiscalYearId,
        collection_ids: ids,
        payment_date: paymentDate,
        account_number: accountNumber.trim(),
        user_note: userNote.trim() || null,
      })
      toast.success(`Batch #${result.batch_id} skapad`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte skapa batch')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-md border bg-card p-4"
      aria-label="Skapa ny batch"
    >
      <h3 className="text-sm font-medium">Ny batch</h3>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-medium">
          Välj uppsamlingar ({selected.size}/{pendingCollections.length})
        </legend>
        <div className="max-h-48 overflow-auto rounded-md border">
          {pendingCollections.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span className="flex-1">
                <span className="font-mono text-xs">#{c.id}</span>{' '}
                <span>{c.counterparty_name}</span>{' '}
                <span className="text-muted-foreground">
                  {c.mandate_reference} · {c.collection_date}
                </span>
              </span>
              <span className="tabular-nums">{formatKr(c.amount_ore)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FieldRow>
        <FieldBlock label="Betalningsdatum">
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
        <FieldBlock label="Konto">
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            required
          />
        </FieldBlock>
      </FieldRow>
      <FieldBlock label="Anteckning (valfri)">
        <input
          type="text"
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </FieldBlock>

      {error && <Callout variant="danger">{error}</Callout>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Avbryt
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createMutation.isPending ? 'Skapar…' : 'Skapa batch'}
        </button>
      </div>
    </form>
  )
}

// ─── Shared small layout helpers ─────────────────────────────────────────

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

function FieldBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}
