import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { ImportStrategy, ValidationResult } from './import-types'

export function ImportPreviewPhase({
  validation,
  strategy,
  onStrategyChange,
  onImport,
  onCancel,
}: {
  validation: ValidationResult
  strategy: ImportStrategy
  onStrategyChange: (s: ImportStrategy) => void
  onImport: () => void
  onCancel: () => void
}) {
  const { summary, errors, warnings, valid } = validation

  return (
    <div className="mx-auto max-w-3xl py-8">
      <h2 className="mb-4 text-lg font-medium">Valideringsresultat</h2>

      <div className="mb-6 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          {valid ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-700">Filen är giltig</span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-700">
                {errors.length} blockerande fel
              </span>
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Företag</dt>
          <dd>{summary.companyName ?? '—'}</dd>
          <dt className="text-muted-foreground">Organisationsnummer</dt>
          <dd>{summary.orgNumber ?? '—'}</dd>
          <dt className="text-muted-foreground">SIE-typ</dt>
          <dd>{summary.sieType ?? '—'}</dd>
          <dt className="text-muted-foreground">Räkenskapsår</dt>
          <dd>{summary.fiscalYears}</dd>
          <dt className="text-muted-foreground">Konton</dt>
          <dd>{summary.accounts}</dd>
          <dt className="text-muted-foreground">Verifikationer</dt>
          <dd>{summary.entries}</dd>
          <dt className="text-muted-foreground">Transaktionsrader</dt>
          <dd>{summary.lines}</dd>
        </dl>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 text-sm font-medium text-red-700">Blockerande fel</h3>
          <ul className="space-y-1 text-xs text-red-600">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">[{e.code}]</span> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {warnings.length} varningar (icke-blockerande)
          </div>
          <ul className="max-h-32 space-y-1 overflow-auto text-xs text-amber-700">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">[{w.code}]</span> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {valid && (
        <div className="mb-6 rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Import-strategi</h3>
          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="strategy"
                value="new"
                checked={strategy === 'new'}
                onChange={() => onStrategyChange('new')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Ny databas</div>
                <div className="text-xs text-muted-foreground">
                  Skapa företag, räkenskapsår, kontoplan och verifikationer från filen.
                  Kräver att databasen är tom.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="strategy"
                value="merge"
                checked={strategy === 'merge'}
                onChange={() => onStrategyChange('merge')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Slå samman (merge)</div>
                <div className="text-xs text-muted-foreground">
                  Matchar befintligt företag via orgNr, lägger till saknade konton,
                  importerar verifikationer i ny serie ("I" för Import).
                </div>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Avbryt
        </button>
        {valid && (
          <button
            type="button"
            onClick={onImport}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Importera
          </button>
        )}
      </div>
    </div>
  )
}
