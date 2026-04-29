import { useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ImportSelectPhase } from '../components/import/ImportSelectPhase'
import { ImportPreviewPhase } from '../components/import/ImportPreviewPhase'
import { ImportDonePhase } from '../components/import/ImportDonePhase'
import type {
  ConflictResolution,
  ImportFormat,
  ImportResult,
  Phase,
  ValidationResult,
} from '../components/import/import-types'

interface FormatApi {
  selectFile: typeof window.api.sie4SelectFile
  validate: typeof window.api.sie4Validate
  import: typeof window.api.sie4Import
}

function getFormatApi(format: ImportFormat): FormatApi {
  if (format === 'sie5') {
    return {
      selectFile: window.api.sie5SelectFile,
      validate: window.api.sie5Validate,
      import: window.api.sie5Import,
    }
  }
  return {
    selectFile: window.api.sie4SelectFile,
    validate: window.api.sie4Validate,
    import: window.api.sie4Import,
  }
}

function formatLabel(format: ImportFormat): string {
  return format === 'sie5' ? 'SIE5' : 'SIE4'
}

interface Props {
  /** Tillbaka till guidad uppstart. */
  onBack: () => void
}

/**
 * Minimal import-variant för first-run: ingen AppShell, ingen
 * FiscalYearContext. Tvingar strategy='new' (databasen är tom).
 * När importen lyckas triggar React Query-invaliate och App.tsx
 * renderar om med AppShell.
 */
export function FirstRunImport({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('select')
  const [format, setFormat] = useState<ImportFormat>('sie4')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, ConflictResolution>
  >({})

  async function handleSelectFile() {
    const api = getFormatApi(format)
    try {
      const result = await api.selectFile()
      if (!result.success || !result.data) return
      const selectedPath = result.data.filePath
      setFilePath(selectedPath)
      setPhase('validating')

      const valResult = await api.validate({ filePath: selectedPath })
      if (!valResult.success) {
        toast.error(valResult.error)
        setPhase('select')
        return
      }
      setValidation(valResult.data)
      setConflictResolutions({})
      setPhase('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte läsa filen')
      setPhase('select')
    }
  }

  async function handleImport() {
    if (!filePath) return
    const api = getFormatApi(format)
    setPhase('importing')
    try {
      // first-run låser strategy='new' — databasen är tom
      const result = await api.import({ filePath, strategy: 'new' })
      if (!result.success) {
        toast.error(result.error)
        setPhase('preview')
        return
      }
      setImportResult(result.data)
      setPhase('done')
      toast.success('Import klar — appen laddas om')
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
    setConflictResolutions({})
  }

  return (
    <div className="flex min-h-screen flex-col" data-testid="first-run-import">
      <div className="flex items-center justify-between border-b px-8 py-5">
        <h1 className="text-lg font-medium">Importera SIE-fil</h1>
        {phase === 'select' && (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground underline hover:no-underline"
            data-testid="first-run-import-back"
          >
            ← Tillbaka till guidad uppstart
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {phase === 'select' && (
          <>
            <div className="mx-auto mt-6 max-w-2xl rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Importen skapar ett nytt bolag baserat på SIE-filens innehåll. Du
              kan fortsätta i guidad uppstart om du inte har en fil.
            </div>
            <ImportSelectPhase
              format={format}
              onFormatChange={setFormat}
              onSelectFile={handleSelectFile}
            />
          </>
        )}
        {phase === 'validating' && (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-muted-foreground">
              Validerar {formatLabel(format)}-fil...
            </p>
          </div>
        )}
        {phase === 'preview' && validation && (
          <ImportPreviewPhase
            validation={validation}
            strategy="new"
            onStrategyChange={() => {
              /* låst i first-run */
            }}
            onImport={handleImport}
            onCancel={handleReset}
            conflictResolutions={conflictResolutions}
            onConflictResolutionChange={(accNum, r) =>
              setConflictResolutions((prev) => ({ ...prev, [accNum]: r }))
            }
          />
        )}
        {phase === 'importing' && (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-muted-foreground">
              Importerar till databasen...
            </p>
          </div>
        )}
        {phase === 'done' && importResult && (
          <ImportDonePhase result={importResult} onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
