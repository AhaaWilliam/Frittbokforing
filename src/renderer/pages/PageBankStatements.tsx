import { useRef, useState, type ChangeEvent } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Upload } from 'lucide-react'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import {
  useBankStatements,
  useBankStatement,
  useImportBankStatement,
  useMatchBankTransaction,
  useInvoiceList,
  useExpenses,
  useUnmatchBankTransaction,
  useUnmatchBankBatch,
} from '../lib/hooks'
import { useRoute, useNavigate, Link } from '../lib/router'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { SuggestedMatchesPanel } from '../components/bank/SuggestedMatchesPanel'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { BANK_FORETAGSKONTO } from '../../shared/bank-accounts'

function fmtKr(ore: number): string {
  const sign = ore < 0 ? '-' : ''
  const abs = Math.abs(ore)
  return (
    sign +
    new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
    }).format(abs / 100)
  )
}

export function PageBankStatements() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { params } = useRoute()
  const statementId = params.id ? Number(params.id) : null

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  if (statementId) {
    return <BankStatementDetail statementId={statementId} />
  }
  return (
    <BankStatementList
      fyId={activeFiscalYear.id}
      companyId={activeFiscalYear.company_id}
    />
  )
}

function BankStatementList({
  fyId,
  companyId,
}: {
  fyId: number
  companyId: number
}) {
  const { data: statements, isLoading } = useBankStatements(fyId)
  const importMutation = useImportBankStatement()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importFormat, setImportFormat] = useState<'camt.053' | 'camt.054'>(
    'camt.053',
  )

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const xml = await file.text()
      const r = await importMutation.mutateAsync({
        company_id: companyId,
        fiscal_year_id: fyId,
        xml_content: xml,
        format: importFormat,
      })
      toast.success(`Importerade ${r.transaction_count} transaktioner`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Importen misslyckades: ${msg}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Bankavstämning"
        action={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={onFileChange}
              data-testid="bank-import-input"
            />
            <label className="mr-2 text-sm">
              <span className="sr-only">Filformat</span>
              <select
                value={importFormat}
                onChange={(e) =>
                  setImportFormat(e.target.value as 'camt.053' | 'camt.054')
                }
                className="rounded-md border border-input bg-background px-2 py-2 text-sm"
                data-testid="bank-import-format"
                title={
                  importFormat === 'camt.054'
                    ? 'camt.054 är transaktionsnotifiering utan balans — balansrapport måste importeras separat via camt.053.'
                    : undefined
                }
              >
                <option value="camt.053">camt.053 (kontoutdrag)</option>
                <option value="camt.054">camt.054 (notifiering)</option>
              </select>
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
              data-testid="bank-import-btn"
            >
              <Upload className="h-4 w-4" />
              Importera {importFormat}
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <LoadingSpinner />
        ) : !statements || statements.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Inga kontoutdrag importerade ännu.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2">Datum</th>
                <th className="px-2 py-2">Statement</th>
                <th className="px-2 py-2">IBAN</th>
                <th className="px-2 py-2 text-right">Öppning</th>
                <th className="px-2 py-2 text-right">Slut</th>
                <th className="px-2 py-2 text-right">Matchade</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-b hover:bg-accent/30">
                  <td className="px-2 py-2">{s.statement_date}</td>
                  <td className="px-2 py-2">{s.statement_number}</td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {s.bank_account_iban}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {fmtKr(s.opening_balance_ore)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {fmtKr(s.closing_balance_ore)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {s.matched_count}/{s.transaction_count}
                  </td>
                  <td className="px-2 py-2">
                    <Link
                      to={`/bank-statements/${s.id}`}
                      className="text-primary hover:underline"
                      testId={`bank-statement-${s.id}-open`}
                    >
                      Öppna
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function BankStatementDetail({ statementId }: { statementId: number }) {
  const { data, isLoading } = useBankStatement(statementId)
  const navigate = useNavigate()
  const [matchingTxId, setMatchingTxId] = useState<number | null>(null)
  const [unmatchingTxId, setUnmatchingTxId] = useState<number | null>(null)
  const [unmatchingBatch, setUnmatchingBatch] = useState<{
    batchId: number
    batchType: 'invoice' | 'expense'
    paymentCount: number
  } | null>(null)
  const unmatchMutation = useUnmatchBankTransaction()
  const unmatchBatchMutation = useUnmatchBankBatch()

  async function handleUnmatch(txId: number) {
    try {
      const r = await unmatchMutation.mutateAsync({ bank_transaction_id: txId })
      const res = r as {
        success?: boolean
        error?: string
        code?: string
        data?: { correction_journal_entry_id: number }
      }
      if (res.success === false) {
        const msg = errorMessage(res.code, res.error)
        toast.error(msg)
      } else {
        toast.success(`Match reverserad — korrigeringsverifikat skapat`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ångra misslyckades')
    } finally {
      setUnmatchingTxId(null)
    }
  }

  async function handleUnmatchBatch(batchId: number) {
    try {
      const r = await unmatchBatchMutation.mutateAsync({ batch_id: batchId })
      const res = r as {
        success?: boolean
        error?: string
        code?: string
        data?: {
          unmatched_payment_count: number
          bank_fee_correction_entry_id: number | null
        }
      }
      if (res.success === false) {
        toast.error(errorMessage(res.code, res.error))
      } else if (res.data) {
        const n = res.data.unmatched_payment_count
        const feeMsg =
          res.data.bank_fee_correction_entry_id !== null ? ' + bankavgift' : ''
        toast.success(`Batch ångrad — ${n} betalning(ar)${feeMsg} reverserade`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ångra misslyckades')
    } finally {
      setUnmatchingBatch(null)
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Statement hittades inte.{' '}
        <Link to="/bank-statements" className="text-primary hover:underline">
          Tillbaka
        </Link>
      </div>
    )
  }

  const { statement, transactions } = data

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={`Kontoutdrag ${statement.statement_number} · ${statement.bank_account_iban} · ${statement.statement_date}`}
        action={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            onClick={() => navigate('/bank-statements')}
            data-testid="bank-back-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex gap-8 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Öppning
            </div>
            <div className="font-medium">
              {fmtKr(statement.opening_balance_ore)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Slut</div>
            <div className="font-medium">
              {fmtKr(statement.closing_balance_ore)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">
              Matchade
            </div>
            <div className="font-medium">
              {statement.matched_count}/{statement.transaction_count}
            </div>
          </div>
        </div>
        <SuggestedMatchesPanel statementId={statementId} />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">Datum</th>
              <th className="px-2 py-2">Motpart</th>
              <th className="px-2 py-2">Meddelande</th>
              <th className="px-2 py-2 text-right">Belopp</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b hover:bg-accent/30">
                <td className="px-2 py-2">{tx.value_date}</td>
                <td className="px-2 py-2">{tx.counterparty_name ?? '—'}</td>
                <td className="px-2 py-2 max-w-xs truncate">
                  {tx.remittance_info ?? '—'}
                </td>
                <td
                  className={`px-2 py-2 text-right font-mono ${tx.amount_ore < 0 ? 'text-red-600' : 'text-green-700'}`}
                >
                  {fmtKr(tx.amount_ore)}
                </td>
                <td className="px-2 py-2 text-xs">
                  {tx.reconciliation_status === 'matched' ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
                      Matchad
                    </span>
                  ) : tx.reconciliation_status === 'excluded' ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-800">
                      Utesluten
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                      Omatchad
                    </span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {tx.reconciliation_status === 'unmatched' && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setMatchingTxId(tx.id)}
                      data-testid={`bank-match-${tx.id}`}
                    >
                      Matcha
                    </button>
                  )}
                  {tx.reconciliation_status === 'matched' &&
                    tx.payment_batch_id === null && (
                      <button
                        type="button"
                        onClick={() => setUnmatchingTxId(tx.id)}
                        className="text-xs text-red-600 hover:underline"
                        data-testid={`bank-unmatch-${tx.id}`}
                      >
                        Ångra
                      </button>
                    )}
                  {tx.reconciliation_status === 'matched' &&
                    tx.payment_batch_id !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          setUnmatchingBatch({
                            batchId: tx.payment_batch_id!,
                            batchType: tx.payment_batch_type ?? 'invoice',
                            paymentCount: tx.payment_batch_size ?? 0,
                          })
                        }
                        className="text-xs text-red-600 hover:underline"
                        data-testid={`bank-unmatch-batch-${tx.id}`}
                      >
                        Ångra batch
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matchingTxId !== null && (
        <MatchDialog
          tx={transactions.find((t) => t.id === matchingTxId)!}
          onClose={() => setMatchingTxId(null)}
        />
      )}
      <ConfirmDialog
        open={unmatchingTxId !== null}
        onOpenChange={(open) => !open && setUnmatchingTxId(null)}
        title="Ångra match"
        description="Detta skapar ett korrigeringsverifikat i C-serien som reverserar betalningen. Ursprungsverifikatet låses mot ytterligare ändringar. Fortsätt?"
        confirmLabel="Ångra match"
        variant="danger"
        onConfirm={() =>
          unmatchingTxId !== null && handleUnmatch(unmatchingTxId)
        }
      />
      <ConfirmDialog
        open={unmatchingBatch !== null}
        onOpenChange={(open) => !open && setUnmatchingBatch(null)}
        title="Ångra hela betalningsbatchen?"
        description={
          unmatchingBatch !== null
            ? batchUnmatchDescription(
                unmatchingBatch.paymentCount,
                unmatchingBatch.batchType,
              )
            : ''
        }
        confirmLabel="Ångra hela batchen"
        variant="danger"
        onConfirm={() =>
          unmatchingBatch !== null &&
          handleUnmatchBatch(unmatchingBatch.batchId)
        }
      />
    </div>
  )
}

function batchUnmatchDescription(
  paymentCount: number,
  batchType: 'invoice' | 'expense',
): string {
  const recipient = batchType === 'expense' ? 'leverantören' : 'kunden'
  return (
    `Detta skapar ett korrigeringsverifikat (C-serien) som reverserar bokföringen för alla ${paymentCount} betalningar i batchen samt batchens bankavgift.\n\n` +
    `Viktigt:\n` +
    `• Pengarna har redan flyttats i banken. Denna ångring påverkar endast bokföringen — den skickar inget nytt bank-kommando.\n` +
    `• Exportfilen (pain.001) för denna batch är redan skickad. Du behöver själv kontakta ${recipient} om pengarna ska återbetalas.\n` +
    `• Ångringen kan inte göras ogjord — den är ett korrigeringsverifikat enligt M140.`
  )
}

function errorMessage(
  code: string | undefined,
  fallback: string | undefined,
): string {
  switch (code) {
    case 'NOT_MATCHED':
      return 'Transaktionen är inte matchad.'
    case 'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED':
      return 'Batch-betalningar kan inte unmatchas per rad.'
    case 'PERIOD_CLOSED':
      return 'Perioden är stängd — öppna den först.'
    case 'ENTRY_ALREADY_CORRECTED':
      return 'Verifikatet är redan korrigerat.'
    default:
      return fallback ?? 'Ångra misslyckades.'
  }
}

function MatchDialog({
  tx,
  onClose,
}: {
  tx: {
    id: number
    amount_ore: number
    value_date: string
    counterparty_name: string | null
  }
  onClose: () => void
}) {
  const { activeFiscalYear } = useFiscalYearContext()
  const fyId = activeFiscalYear?.id ?? 0
  const direction = tx.amount_ore > 0 ? 'invoice' : 'expense'
  const invoicesQuery = useInvoiceList(fyId, { status: 'unpaid' })
  const expensesQuery = useExpenses(fyId, { status: 'unpaid' })
  const matchMutation = useMatchBankTransaction()
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [paymentAccount, setPaymentAccount] =
    useState<string>(BANK_FORETAGSKONTO)

  const candidates: Candidate[] =
    direction === 'invoice'
      ? ((invoicesQuery.data as { items?: Candidate[] } | undefined)?.items ??
        [])
      : ((expensesQuery.data as { expenses?: Candidate[] } | undefined)
          ?.expenses ?? [])

  async function onSubmit() {
    if (!selectedEntityId) return
    try {
      await matchMutation.mutateAsync({
        bank_transaction_id: tx.id,
        matched_entity_type: direction,
        matched_entity_id: selectedEntityId,
        payment_account: paymentAccount,
      })
      toast.success('Transaktion matchad')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Match misslyckades: ${msg}`)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      data-testid="bank-match-dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">Matcha bank-transaktion</h2>
        <div className="mb-3 text-sm text-muted-foreground">
          {tx.value_date} · {fmtKr(tx.amount_ore)} ·{' '}
          {direction === 'invoice'
            ? 'Inkommande → välj faktura'
            : 'Utgående → välj kostnad'}
        </div>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs uppercase text-muted-foreground">
            {direction === 'invoice' ? 'Faktura' : 'Kostnad'}
          </span>
          <select
            className="w-full rounded border bg-background p-2 text-sm"
            value={selectedEntityId ?? ''}
            onChange={(e) =>
              setSelectedEntityId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            data-testid="bank-match-entity-select"
          >
            <option value="">— Välj —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {describeCandidate(c, direction)}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs uppercase text-muted-foreground">
            Bankkonto
          </span>
          <input
            type="text"
            className="w-full rounded border bg-background p-2 text-sm"
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
            data-testid="bank-match-account-input"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={onClose}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!selectedEntityId || matchMutation.isPending}
            onClick={onSubmit}
            data-testid="bank-match-submit"
          >
            Matcha
          </button>
        </div>
      </div>
    </div>
  )
}

type Candidate = {
  id: number
  total_amount_ore: number
  counterparty_name?: string
  invoice_number?: string
  supplier_invoice_number?: string
}

function describeCandidate(
  c: Candidate,
  direction: 'invoice' | 'expense',
): string {
  const num =
    direction === 'invoice' ? c.invoice_number : c.supplier_invoice_number
  const amt = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
  }).format(c.total_amount_ore / 100)
  return `${num ?? '—'} · ${c.counterparty_name ?? '—'} · ${amt}`
}
