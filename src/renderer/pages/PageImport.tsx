import { useState } from 'react'
import { Upload, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

type ImportStrategy = 'new' | 'merge'

interface ValidationSummary {
  accounts: number
  entries: number
  lines: number
  fiscalYears: number
  sieType: number | null
  programName: string | null
  companyName: string | null
  orgNumber: string | null
}

interface ValidationResult {
  valid: boolean
  errors: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  summary: ValidationSummary
}

interface ImportResult {
  companyId: number
  fiscalYearId: number
  accountsAdded: number
  accountsUpdated: number
  entriesImported: number
  linesImported: number
  warnings: string[]
}

type Phase = 'select' | 'validating' | 'preview' | 'importing' | 'done'

export function PageImport() {
  const [phase, setPhase] = useState<Phase>('select')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [strategy, setStrategy] = useState<ImportStrategy>('new')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  async function handleSelectFile() {
    try {
      const result = await window.api.sie4SelectFile()
      if (!result.success || !result.data) return
      const selectedPath = result.data.filePath
      setFilePath(selectedPath)
      setPhase('validating')

      const valResult = await window.api.sie4Validate({ filePath: selectedPath })
      if (!valResult.success) {
        toast.error(valResult.error)
        setPhase('select')
        return
      }
      setValidation(valResult.data)
      setPhase('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte läsa filen')
      setPhase('select')
    }
  }

  async function handleImport() {
    if (!filePath) return
    setPhase('importing')
    try {
      const result = await window.api.sie4Import({ filePath, strategy })
      if (!result.success) {
        toast.error(result.error)
        setPhase('preview')
        return
      }
      setImportResult(result.data)
      setPhase('done')
      toast.success('Import klar')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import misslyckades')
      setPhase('preview')
    }
  }

  function handleReset() {
    setPhase('select')
    setFilePath(null)
    setValidation(null)
    setImportResult(null)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="page-import">
      <PageHeader title="Importera SIE4" />
      <div className="flex-1 overflow-auto px-6 pb-6">
        {phase === 'select' && (
          <SelectPhase onSelectFile={handleSelectFile} />
        )}
        {phase === 'validating' && (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-muted-foreground">Validerar SIE4-fil...</p>
          </div>
        )}
        {phase === 'preview' && validation && (
          <PreviewPhase
            validation={validation}
            strategy={strategy}
            onStrategyChange={setStrategy}
            onImport={handleImport}
            onCancel={handleReset}
          />
        )}
        {phase === 'importing' && (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-muted-foreground">Importerar till databasen...</p>
          </div>
        )}
        {phase === 'done' && importResult && (
          <DonePhase result={importResult} onReset={handleReset} />
        )}
      </div>
    </div>
  )
}

// ═══ Select phase ═══

function SelectPhase({ onSelectFile }: { onSelectFile: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Välj SIE4-fil att importera</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Stödjer .se, .si och .sie filer med SIETYP 4.
        </p>
        <button
          type="button"
          onClick={onSelectFile}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="h-4 w-4" />
          Välj fil
        </button>
      </div>
    </div>
  )
}

// ═══ Preview phase ═══

function PreviewPhase({
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

// ═══ Done phase ═══

function DonePhase({
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
