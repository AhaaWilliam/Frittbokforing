import { useManualEntryDrafts, useManualEntries } from '../../lib/hooks'
import { consumeFlashable } from '../../lib/flashable'
import { formatKr } from '../../lib/format'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { TableSkeleton } from '../ui/TableSkeleton'
import { EmptyState, ManualEntryIllustration } from '../ui/EmptyState'
import { Pill } from '../ui/Pill'
import { SectionLabel } from '../ui/SectionLabel'
import { ZoneNuHead } from '../ui/ZoneNuHead'

interface ManualEntryListProps {
  onCreate: () => void
  onEdit: (id: number) => void
  onView?: (id: number) => void
}

/**
 * Sprint H+G-6 — ManualEntryList restyling.
 *
 * Verifikat-list i Nu-zonen med ZoneNuHead-metadata (titel + sub som
 * räknar drafts/booked), status-dots per rad och mono-formaterade
 * id/datum/belopp-kolumner. Matchar H+G-prototypens VerifikatList.
 */
export function ManualEntryList({
  onCreate,
  onEdit,
  onView,
}: ManualEntryListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const fiscalYearId = activeFiscalYear?.id

  const { data: drafts, isLoading: draftsLoading } =
    useManualEntryDrafts(fiscalYearId)
  const { data: entries, isLoading: entriesLoading } =
    useManualEntries(fiscalYearId)

  const draftCount = drafts?.length ?? 0
  const bookedCount = entries?.length ?? 0
  const latestId = entries?.[0]
    ? `${entries[0].verification_series}${entries[0].verification_number}`
    : null

  const subParts: string[] = []
  if (bookedCount > 0) subParts.push(`${bookedCount} verifikat`)
  if (draftCount > 0) subParts.push(`${draftCount} utkast`)
  if (latestId) subParts.push(`senast ${latestId}`)
  const sub = subParts.length > 0 ? subParts.join(' · ') : undefined

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ZoneNuHead title="Bokföringsorder" sub={sub} />

      <div className="flex-1 space-y-8 overflow-auto px-8 py-6">
        {/* Drafts section */}
        <section>
          <SectionLabel as="h3" className="mb-3">
            Utkast
          </SectionLabel>
          {draftsLoading ? (
            <LoadingSpinner />
          ) : !drafts || drafts.length === 0 ? (
            <p className="text-sm italic text-[var(--text-faint)]">
              Inga utkast.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onEdit(draft.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-elevated)] px-4 py-3 text-left transition-colors hover:border-[var(--border-strong)]"
                >
                  <span className="flex items-center gap-3">
                    <StatusDot tone="warning" />
                    <span className="text-sm font-medium">
                      {draft.description || 'Utan beskrivning'}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-secondary)]">
                      {draft.entry_date}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--text-faint)]">
                    Utkast
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Finalized section */}
        <section>
          <SectionLabel as="h3" className="mb-3">
            Bokförda
          </SectionLabel>
          {entriesLoading ? (
            <TableSkeleton
              columns={5}
              rows={5}
              ariaLabel="Laddar bokförda verifikationer"
            />
          ) : !entries || entries.length === 0 ? (
            !drafts || drafts.length === 0 ? (
              <EmptyState
                icon={<ManualEntryIllustration />}
                title="Inga manuella verifikationer ännu"
                description="Skapa din första bokföringsorder."
                action={{
                  label: 'Ny bokföringsorder',
                  onClick: onCreate,
                }}
              />
            ) : (
              <p className="text-sm italic text-[var(--text-faint)]">
                Inga bokförda poster.
              </p>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-left text-xs text-[var(--text-secondary)]">
                    <th
                      className="w-6 pb-2 pr-2 font-medium"
                      aria-label="Status"
                    />
                    <th className="pb-2 pr-4 font-medium">Verifikat</th>
                    <th className="pb-2 pr-4 font-medium">Datum</th>
                    <th className="pb-2 pr-4 font-medium">Beskrivning</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Belopp</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isCorrected = entry.je_status === 'corrected'
                    const isCorrection = entry.corrects_entry_id != null
                    const tone = isCorrected
                      ? 'danger'
                      : isCorrection
                        ? 'info'
                        : 'mint'
                    // VS-45: flash-animation om denna entry just bokfördes.
                    // consumeFlashable returnerar true en gång — re-render
                    // får inte upprepa animationen.
                    const flash = consumeFlashable('manualEntry', entry.id)
                    return (
                      <tr
                        key={entry.id}
                        className={`cursor-pointer border-b border-[var(--border-default)] last:border-0 hover:bg-[var(--surface-secondary)]/40${flash ? ' fritt-flash' : ''}`}
                        onClick={() => onView?.(entry.id)}
                      >
                        <td className="py-2 pr-2">
                          <StatusDot tone={tone} />
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {entry.verification_series}
                          {entry.verification_number}
                        </td>
                        <td className="py-2 pr-4 font-mono">
                          {entry.entry_date}
                        </td>
                        <td className="py-2 pr-4">
                          {entry.description || '—'}
                        </td>
                        <td className="py-2 pr-4">
                          {isCorrected && (
                            <Pill variant="danger">Korrigerad</Pill>
                          )}
                          {isCorrection && (
                            <Pill variant="info">Korrigering</Pill>
                          )}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {formatKr(entry.total_amount_ore)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function StatusDot({ tone }: { tone: 'mint' | 'warning' | 'danger' | 'info' }) {
  const color =
    tone === 'mint'
      ? 'var(--color-mint-500)'
      : tone === 'warning'
        ? 'var(--color-warning-500)'
        : tone === 'danger'
          ? 'var(--color-danger-500)'
          : 'var(--color-brand-500)'
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
      aria-hidden="true"
    />
  )
}
