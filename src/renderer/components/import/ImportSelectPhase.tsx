import { Upload } from 'lucide-react'

export function ImportSelectPhase({ onSelectFile }: { onSelectFile: () => void }) {
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
