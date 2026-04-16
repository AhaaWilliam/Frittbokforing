import { CheckCircle2 } from 'lucide-react'
import type { ImportResult } from './import-types'

export function ImportDonePhase({
  result,
  onReset,
}: {
  result: ImportResult
  onReset: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <h2 className="text-lg font-medium text-green-700">Import klar</h2>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Konton tillagda</dt>
          <dd className="font-medium">{result.accountsAdded}</dd>
          <dt className="text-muted-foreground">Konton uppdaterade</dt>
          <dd className="font-medium">{result.accountsUpdated}</dd>
          <dt className="text-muted-foreground">Verifikationer importerade</dt>
          <dd className="font-medium">{result.entriesImported}</dd>
          <dt className="text-muted-foreground">Transaktionsrader</dt>
          <dd className="font-medium">{result.linesImported}</dd>
        </dl>

        {result.warnings.length > 0 && (
          <div className="mt-4 rounded-md bg-amber-100 p-3">
            <p className="mb-1 text-xs font-medium text-amber-700">
              {result.warnings.length} varningar:
            </p>
            <ul className="space-y-0.5 text-xs text-amber-700">
              {result.warnings.slice(0, 5).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
              {result.warnings.length > 5 && (
                <li>... och {result.warnings.length - 5} till</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Importera en ny fil
        </button>
      </div>
    </div>
  )
}
