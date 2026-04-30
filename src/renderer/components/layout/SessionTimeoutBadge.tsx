import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

/**
 * Badge som varnar när session-timeout närmar sig.
 *
 * Pollar auth.status() var 30:e sekund; visas endast när återstående tid
 * är under WARN_THRESHOLD_MS. Pollen triggar inte touch (auth:status är
 * explicit touch-fri i main-processen), så badgen påverkar inte själva
 * timern — den observerar bara.
 */
const WARN_THRESHOLD_MS = 5 * 60 * 1000 // 5 min
const POLL_INTERVAL_MS = 30 * 1000 // 30 s

export function SessionTimeoutBadge() {
  const [msUntilLock, setMsUntilLock] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await window.auth?.status?.()
        if (cancelled || !res) return
        if (res.success && !res.data.locked) {
          setMsUntilLock(res.data.msUntilLock)
        } else {
          setMsUntilLock(null)
        }
      } catch {
        // window.auth unavailable (e.g. test env without preload mock) — no-op
      }
    }

    void poll()
    const handle = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(handle)
    }
  }, [])

  if (msUntilLock == null || msUntilLock > WARN_THRESHOLD_MS) return null

  const minutes = Math.max(1, Math.ceil(msUntilLock / 60_000))
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="session-timeout-badge"
      className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-warning-100 bg-warning-100/50 px-3 py-2 text-xs text-warning-700"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        Sessionen låses om <strong>{minutes}</strong>{' '}
        {minutes === 1 ? 'minut' : 'minuter'}
      </span>
    </div>
  )
}
