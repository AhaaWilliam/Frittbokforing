import { PageHeader } from '../components/layout/PageHeader'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useImportedEntries } from '../lib/hooks'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { formatKr } from '../lib/format'

export function PageImportedEntries() {
  const { activeFiscalYear } = useFiscalYearContext()
  const fiscalYearId = activeFiscalYear?.id
  const { data: entries, isLoading } = useImportedEntries(fiscalYearId)

  return (
    <>
      <PageHeader title="Importerade verifikat" />
      <div className="flex-1 overflow-auto px-8 py-6">
        {isLoading ? (
          <TableSkeleton
            columns={5}
            rows={5}
            ariaLabel="Laddar importerade verifikat"
          />
        ) : !entries || entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Inga importerade verifikat för valt räkenskapsår.
            <div className="mt-1 text-xs">
              Verifikat från SIE-import hamnar i I-serien och visas här.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Verifikation</th>
                  <th className="pb-2 pr-4 font-medium">Datum</th>
                  <th className="pb-2 pr-4 font-medium">Beskrivning</th>
                  <th className="pb-2 pr-4 font-medium">Källa</th>
                  <th className="pb-2 text-right font-medium">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.journal_entry_id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">
                      {entry.verification_series}
                      {entry.verification_number}
                    </td>
                    <td className="py-2 pr-4">{entry.journal_date}</td>
                    <td className="py-2 pr-4">{entry.description || '-'}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {entry.source_reference || '-'}
                    </td>
                    <td className="py-2 text-right">
                      {formatKr(entry.total_amount_ore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
