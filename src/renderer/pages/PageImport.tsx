import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { ImportSelectPhase } from '../components/import/ImportSelectPhase'
import { ImportPreviewPhase } from '../components/import/ImportPreviewPhase'
import { ImportDonePhase } from '../components/import/ImportDonePhase'
import type {
  ImportResult,
  ImportStrategy,
  Phase,
  ValidationResult,
} from '../components/import/import-types'

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
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title="Importera SIE4" />
      <div className="flex-1 overflow-auto px-6 pb-6">
        {phase === 'select' && (
          <ImportSelectPhase onSelectFile={handleSelectFile} />
        )}
        {phase === 'validating' && (
          <div className="py-16 text-center">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-muted-foreground">Validerar SIE4-fil...</p>
          </div>
        )}
        {phase === 'preview' && validation && (
          <ImportPreviewPhase
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
          <ImportDonePhase result={importResult} onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
