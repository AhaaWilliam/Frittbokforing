import { Upload } from 'lucide-react'
import type { ImportFormat } from './import-types'

export function ImportSelectPhase({
  format,
  onFormatChange,
  onSelectFile,
}: {
  format: ImportFormat
  onFormatChange: (f: ImportFormat) => void
  onSelectFile: () => void
}) {
  const heading =
    format === 'sie5'
      ? 'Välj SIE5-fil att importera'
      : 'Välj SIE4-fil att importera'
  const description =
    format === 'sie5'
      ? 'Stödjer .sie och .xml filer med SIE5 (XML-format).'
      : 'Stödjer .se, .si och .sie filer med SIETYP 4.'

  return (
    <div className="mx-auto max-w-2xl py-12">
      <fieldset
        className="mb-6 rounded-lg border p-4"
        data-testid="import-format-fieldset"
      >
        <legend className="px-2 text-sm font-medium">Filformat</legend>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-format"
              value="sie4"
              checked={format === 'sie4'}
              onChange={() => onFormatChange('sie4')}
              data-testid="import-format-sie4"
            />
            SIE4 (text)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="import-format"
              value="sie5"
              checked={format === 'sie5'}
              onChange={() => onFormatChange('sie5')}
              data-testid="import-format-sie5"
            />
            SIE5 (XML)
          </label>
        </div>
      </fieldset>

      <div className="rounded-lg border border-dashed p-12 text-center">
        <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">{heading}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
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
