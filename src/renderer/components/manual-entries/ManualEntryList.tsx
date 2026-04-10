import {
  useManualEntryDrafts,
  useManualEntries,
} from '../../lib/hooks'
import { formatKr } from '../../lib/format'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import {
  EmptyState,
  ManualEntryIllustration,
} from '../ui/EmptyState'

interface ManualEntryListProps {
  onCreate: () => void
  onEdit: (id: number) => void
}

export function ManualEntryList({ onCreate, onEdit }: ManualEntryListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const fiscalYearId = activeFiscalYear?.id

  const { data: drafts, isLoading: draftsLoading } =
    useManualEntryDrafts(fiscalYearId)
  const { data: entries, isLoading: entriesLoading } =
    useManualEntries(fiscalYearId)

  return (
    <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
      {/* Drafts section */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Utkast
        </h2>
        {draftsLoading ? (
          <LoadingSpinner />
        ) : !drafts || drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga utkast.</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onEdit(draft.id)}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {draft.description || 'Utan beskrivning'}
                    </span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {draft.entry_date}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Utkast
                  </span>
                </button>
              ),
            )}
          </div>
        )}
      </section>

      {/* Finalized section */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Bokförda
        </h2>
        {entriesLoading ? (
          <LoadingSpinner />
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
            <p className="text-sm text-muted-foreground">
              Inga bokförda poster.
            </p>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Verifikation</th>
                  <th className="pb-2 pr-4 font-medium">Datum</th>
                  <th className="pb-2 pr-4 font-medium">Beskrivning</th>
                  <th className="pb-2 text-right font-medium">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">
                        {entry.verification_series}{entry.verification_number}
                      </td>
                      <td className="py-2 pr-4">{entry.entry_date}</td>
                      <td className="py-2 pr-4">
                        {entry.description || '-'}
                      </td>
                      <td className="py-2 text-right">
                        {formatKr(entry.total_amount)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
