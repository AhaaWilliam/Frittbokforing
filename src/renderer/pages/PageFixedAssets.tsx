import { Fragment, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { todayLocal } from '../../shared/date-utils'
import {
  useFixedAssets,
  useExecuteDepreciationPeriod,
  useDisposeFixedAsset,
  useDeleteFixedAsset,
} from '../lib/hooks'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { Pill, type PillVariant } from '../components/ui/Pill'
import { FixedAssetFormDialog } from '../components/fixed-assets/FixedAssetFormDialog'
import { FixedAssetDetailPanel } from '../components/fixed-assets/FixedAssetDetailPanel'
import { DisposeDialog } from '../components/fixed-assets/DisposeDialog'
import type { FixedAssetWithAccumulation } from '../../shared/types'

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  disposed: 'Avyttrad',
  fully_depreciated: 'Fullt avskriven',
}

const STATUS_PILL: Record<string, PillVariant> = {
  active: 'info',
  disposed: 'neutral',
  fully_depreciated: 'success',
}

function fmtKr(ore: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
  }).format(ore / 100)
}

export function PageFixedAssets() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [showCreate, setShowCreate] = useState(false)
  const [editingAsset, setEditingAsset] =
    useState<FixedAssetWithAccumulation | null>(null)
  const [disposingAsset, setDisposingAsset] = useState<{
    id: number
    name: string
  } | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const { data: assets, isLoading } = useFixedAssets(activeFiscalYear?.id)
  const executeMutation = useExecuteDepreciationPeriod()
  const disposeMutation = useDisposeFixedAsset()
  const deleteMutation = useDeleteFixedAsset()

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  async function handleExecutePeriod() {
    if (!activeFiscalYear) return
    const today = todayLocal()
    const periodEnd =
      today > activeFiscalYear.end_date ? activeFiscalYear.end_date : today
    if (
      !confirm(
        `Kör avskrivningar till och med ${periodEnd}? Skapar E-serie-verifikat per tillgång.`,
      )
    )
      return
    try {
      const r = await executeMutation.mutateAsync({
        fiscal_year_id: activeFiscalYear.id,
        period_end_date: periodEnd,
      })
      if (r.batch_status === 'completed') {
        toast.success(`${r.succeeded.length} avskrivningar bokförda`)
      } else if (r.batch_status === 'partial') {
        toast.warning(
          `${r.succeeded.length} lyckades, ${r.failed.length} misslyckades`,
        )
      } else {
        toast.error('Alla avskrivningar misslyckades — batch rullades tillbaka')
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte köra avskrivningar',
      )
    }
  }

  function handleDispose(id: number, name: string) {
    setDisposingAsset({ id, name })
  }

  async function handleDisposeConfirm(result: {
    disposed_date: string
    generate_journal_entry: boolean
    sale_price_ore: number
    proceeds_account: string | null
  }) {
    if (!disposingAsset) return
    const { id, name } = disposingAsset
    try {
      await disposeMutation.mutateAsync({ id, ...result })
      toast.success(
        result.generate_journal_entry
          ? `${name} avyttrad + disposal-verifikat bokfört`
          : `${name} markerad som avyttrad`,
      )
      setDisposingAsset(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte avyttra')
    }
  }

  async function handleDelete(id: number, name: string) {
    if (
      !confirm(
        `Radera "${name}" permanent? Kan bara raderas om inga avskrivningar bokförts.`,
      )
    )
      return
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success(`${name} raderad`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte radera')
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Anläggningstillgångar"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExecutePeriod}
              disabled={executeMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              data-testid="fa-execute-period"
            >
              <Play className="h-4 w-4" />
              Kör avskrivningar
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="fa-create"
            >
              <Plus className="h-4 w-4" />
              Ny tillgång
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : !assets || assets.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Inga anläggningstillgångar. Skapa en för att komma igång.
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="w-8 py-2" />
                <th className="py-2 pr-4">Namn</th>
                <th className="py-2 pr-4">Anskaffning</th>
                <th className="py-2 pr-4 text-right">Anskaffningsvärde</th>
                <th className="py-2 pr-4 text-right">Ack. avskr.</th>
                <th className="py-2 pr-4 text-right">Bokfört värde</th>
                <th className="py-2 pr-4 text-right">Schedule</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Åtgärder</th>
              </tr>
            </thead>
            <tbody data-testid="fa-list">
              {assets.map((a) => {
                const isExpanded = expandedId === a.id
                return (
                  <Fragment key={a.id}>
                    <tr className="border-b" data-testid={`fa-row-${a.id}`}>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : a.id)
                          }
                          aria-label={
                            isExpanded ? 'Dölj detaljer' : 'Visa detaljer'
                          }
                          aria-expanded={isExpanded}
                          data-testid={`fa-toggle-${a.id}`}
                          className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 pr-4 font-medium">{a.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {a.acquisition_date}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {fmtKr(a.acquisition_cost_ore)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {fmtKr(a.accumulated_depreciation_ore)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {fmtKr(a.book_value_ore)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {a.schedules_executed}/{a.schedules_generated}
                      </td>
                      <td className="py-2 pr-4">
                        <Pill variant={STATUS_PILL[a.status] ?? 'neutral'}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </Pill>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {a.status === 'active' &&
                          a.schedules_executed === 0 && (
                            <button
                              type="button"
                              onClick={() => setEditingAsset(a)}
                              aria-label={`Redigera ${a.name}`}
                              title="Redigera"
                              data-testid={`fa-edit-${a.id}`}
                              className="mr-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        {a.status === 'active' && (
                          <button
                            type="button"
                            onClick={() => handleDispose(a.id, a.name)}
                            disabled={disposeMutation.isPending}
                            className="mr-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            aria-label={`Avyttra ${a.name}`}
                            title="Avyttra"
                            data-testid={`fa-dispose-${a.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {a.status === 'active' &&
                          a.schedules_executed === 0 && (
                            <button
                              type="button"
                              onClick={() => handleDelete(a.id, a.name)}
                              disabled={deleteMutation.isPending}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                              aria-label={`Radera ${a.name}`}
                              title="Radera"
                              data-testid={`fa-delete-${a.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr data-testid={`fa-detail-row-${a.id}`}>
                        <td colSpan={9} className="p-0">
                          <FixedAssetDetailPanel assetId={a.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <FixedAssetFormDialog
        key={editingAsset ? `edit-${editingAsset.id}` : 'create'}
        open={showCreate || editingAsset !== null}
        onOpenChange={(o) => {
          if (!o) {
            setShowCreate(false)
            setEditingAsset(null)
          }
        }}
        mode={editingAsset ? 'edit' : 'create'}
        initialAsset={editingAsset ?? undefined}
      />
      {disposingAsset && (
        <DisposeDialog
          assetName={disposingAsset.name}
          onConfirm={handleDisposeConfirm}
          onCancel={() => setDisposingAsset(null)}
        />
      )}
    </div>
  )
}
