import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useExportWriteFile } from '../lib/hooks'

export function PageExport() {
  const { activeFiscalYear } = useFiscalYearContext()
  const exportMutation = useExportWriteFile()

  const [excelFrom, setExcelFrom] = useState('')
  const [excelTo, setExcelTo] = useState('')
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  const fyId = activeFiscalYear?.id

  function handleExport(format: 'sie5' | 'sie4' | 'excel') {
    if (!fyId) return
    setFeedback((prev) => ({ ...prev, [format]: '' }))

    const dateRange =
      format === 'excel' && excelFrom && excelTo
        ? { from: excelFrom, to: excelTo }
        : undefined

    exportMutation.mutate(
      { format, fiscal_year_id: fyId, date_range: dateRange },
      {
        onSuccess: (data) => {
          if (data.filePath) {
            const name = data.filePath.split('/').pop() ?? ''
            setFeedback((prev) => ({
              ...prev,
              [format]: `\u2713 Exporterad till ${name}`,
            }))
          }
        },
        onError: (err) => {
          setFeedback((prev) => ({
            ...prev,
            [format]: `Fel: ${err.message}`,
          }))
        },
      },
    )
  }

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader title="Export" />
        <p className="mt-16 text-center text-muted-foreground">
          Inget räkenskapsår valt.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader title="Export" />
      <div className="p-8">
        <div className="grid gap-6 md:grid-cols-3">
          {/* SIE5 */}
          <div className="rounded-lg border p-5">
            <h3 className="mb-1 font-medium">SIE5 (XML)</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Standardformat för överföring till andra system.
            </p>
            <button
              onClick={() => handleExport('sie5')}
              disabled={exportMutation.isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Exportera SIE5
            </button>
            {feedback.sie5 && (
              <p className="mt-2 text-sm text-green-600">{feedback.sie5}</p>
            )}
          </div>

          {/* SIE4 */}
          <div className="rounded-lg border p-5">
            <h3 className="mb-1 font-medium">SIE4</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Äldre format med brett stöd hos de flesta bokföringsprogram.
            </p>
            <button
              onClick={() => handleExport('sie4')}
              disabled={exportMutation.isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Exportera SIE4
            </button>
            {feedback.sie4 && (
              <p className="mt-2 text-sm text-green-600">{feedback.sie4}</p>
            )}
          </div>

          {/* Excel */}
          <div className="rounded-lg border p-5">
            <h3 className="mb-1 font-medium">Excel (XLSX)</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Verifikationslista, huvudbok och saldobalans.
            </p>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="date"
                value={excelFrom}
                onChange={(e) => setExcelFrom(e.target.value)}
                placeholder={activeFiscalYear.start_date}
                min={activeFiscalYear.start_date}
                max={activeFiscalYear.end_date}
                className="w-full rounded border px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground">&mdash;</span>
              <input
                type="date"
                value={excelTo}
                onChange={(e) => setExcelTo(e.target.value)}
                placeholder={activeFiscalYear.end_date}
                min={activeFiscalYear.start_date}
                max={activeFiscalYear.end_date}
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
            <button
              onClick={() => handleExport('excel')}
              disabled={exportMutation.isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Exportera Excel
            </button>
            {feedback.excel && (
              <p className="mt-2 text-sm text-green-600">{feedback.excel}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
