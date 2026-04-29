import { useEffect, useRef, useState } from 'react'

/**
 * Sprint 16 — useJournalPreview-hook (ADR 006).
 *
 * Debounced anrop till `preview:journal-lines`-IPC. Skip-call när:
 * - `enabled === false`
 * - `input === null`
 *
 * Stale-write skydd: ett request-id cancellerar tidigare resultat så att
 * snabba ändringar inte ger out-of-order updates.
 *
 * Default debounce: 150 ms — speglar industri-norm för "user paused
 * typing". Configurable via `debounceMs`-prop.
 */

type PreviewInput = Parameters<typeof window.api.previewJournalLines>[0]
type PreviewSuccess = Extract<
  Awaited<ReturnType<typeof window.api.previewJournalLines>>,
  { success: true }
>['data']

export interface UseJournalPreviewResult {
  /** Senaste lyckade preview-resultat. `null` när inget eller fel. */
  preview: PreviewSuccess | null
  /** Senaste IPC-fel (validation, unexpected). `null` när OK. */
  error: { code: string; message: string; field?: string } | null
  /** True medan vi väntar på response (efter debounce-timeout). */
  pending: boolean
}

const DEFAULT_DEBOUNCE_MS = 150

export function useJournalPreview(
  input: PreviewInput | null,
  options?: { enabled?: boolean; debounceMs?: number },
): UseJournalPreviewResult {
  const enabled = options?.enabled ?? true
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS

  const [preview, setPreview] = useState<PreviewSuccess | null>(null)
  const [error, setError] = useState<UseJournalPreviewResult['error']>(null)
  const [pending, setPending] = useState(false)

  // Stable input-key så useEffect inte trigger:as i onödan
  const inputJson = input ? JSON.stringify(input) : null

  // Request-id för stale-write skydd
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled || !inputJson) {
      setPreview(null)
      setError(null)
      setPending(false)
      return
    }

    setPending(true)
    const myId = ++requestIdRef.current
    const parsedInput = JSON.parse(inputJson) as PreviewInput

    const timeout = setTimeout(() => {
      window.api
        .previewJournalLines(parsedInput)
        .then((result) => {
          // Stale-check: om en nyare request startat, ignorera oss
          if (myId !== requestIdRef.current) return

          if (result.success) {
            setPreview(result.data)
            setError(null)
          } else {
            setPreview(null)
            setError({
              code: result.code,
              message: result.error,
              field: result.field,
            })
          }
          setPending(false)
        })
        .catch((err: unknown) => {
          if (myId !== requestIdRef.current) return
          setPreview(null)
          setError({
            code: 'UNEXPECTED_ERROR',
            message: err instanceof Error ? err.message : 'Okänt fel.',
          })
          setPending(false)
        })
    }, debounceMs)

    return () => clearTimeout(timeout)
  }, [enabled, inputJson, debounceMs])

  return { preview, error, pending }
}
