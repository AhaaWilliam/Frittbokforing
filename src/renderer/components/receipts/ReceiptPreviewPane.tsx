import { useIpcQuery } from '../../lib/use-ipc-query'

/**
 * Sprint VS-143 — ReceiptPreviewPane.
 *
 * Inline-preview av kvitto i sheet-sidobar och Inkorgen. Native iframe
 * för PDF + `<img>` för bilder (jpg/png/webp/heic/gif). Ingen PDF.js —
 * Electron's native Chromium-PDF-viewer räcker.
 *
 * Path-resolutionen sker i main-process via `receipt:get-absolute-path`
 * (path-traversal-skydd). Renderer får aldrig konstruera file://-URL själv.
 *
 * Format-detection via filändelse på path. HEIC kanske inte renderas av
 * alla Chromium-builds — fallback "Kan inte visa filen" om varken PDF
 * eller bild-extension känns igen.
 */

const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.gif',
] as const

type Kind = 'pdf' | 'image' | 'unknown'

function detectKind(path: string): Kind {
  const lower = path.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image'
  return 'unknown'
}

interface Props {
  receiptPath: string | null
}

export function ReceiptPreviewPane({ receiptPath }: Props) {
  const kind = receiptPath ? detectKind(receiptPath) : 'unknown'

  const query = useIpcQuery(
    ['receipt:get-absolute-path', receiptPath],
    () => window.api.getReceiptAbsolutePath({ receipt_path: receiptPath! }),
    {
      enabled: !!receiptPath && kind !== 'unknown',
    },
  )

  if (!receiptPath) return null

  const containerClass =
    'flex h-full min-h-[400px] w-full flex-col overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)]/40'

  if (kind === 'unknown') {
    return (
      <div
        className={containerClass}
        data-testid="receipt-preview-fallback"
        role="status"
      >
        <FallbackMessage>
          Kan inte visa filen — okänt format ({receiptPath.split('.').pop()}).
        </FallbackMessage>
      </div>
    )
  }

  if (query.isPending) {
    return (
      <div
        className={containerClass}
        data-testid="receipt-preview-loading"
        role="status"
      >
        <FallbackMessage>Laddar kvitto…</FallbackMessage>
      </div>
    )
  }

  if (query.isError || !query.data) {
    const msg =
      query.error instanceof Error
        ? query.error.message
        : 'Okänt fel vid laddning av kvitto.'
    return (
      <div
        className={containerClass}
        data-testid="receipt-preview-error"
        role="alert"
      >
        <FallbackMessage>Kunde inte ladda kvitto: {msg}</FallbackMessage>
      </div>
    )
  }

  const url = query.data.url

  return (
    <div className={containerClass} data-testid="receipt-preview-pane">
      {kind === 'pdf' ? (
        <iframe
          src={url}
          title="Kvitto-preview"
          aria-label="Kvitto-preview (PDF)"
          className="h-full w-full flex-1 border-0"
          data-testid="receipt-preview-iframe"
        />
      ) : (
        <img
          src={url}
          alt="Kvitto"
          className="h-full w-full flex-1 object-contain"
          data-testid="receipt-preview-image"
        />
      )}
    </div>
  )
}

function FallbackMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-[var(--text-faint)]">
      {children}
    </div>
  )
}
