/**
 * Main-process time injection (M150).
 *
 * All time-sensitive business logic (chronology guard, overdue status,
 * export timestamps, backup filenames) MUST read the current time via
 * getNow() instead of calling `new Date()` directly.
 *
 * In tests (NODE_ENV=test OR FRITT_TEST=1) the value of the FRITT_NOW
 * env var overrides the clock. FRITT_NOW is parsed as an ISO 8601 string.
 * Invalid or unparseable values fall back to real time and log a warning
 * once per process — never crash tests silently.
 *
 * In production, this is indistinguishable from `new Date()`.
 */

let warnedOnce = false

export function getNow(): Date {
  const env = process.env
  const isTest = env.NODE_ENV === 'test' || env.FRITT_TEST === '1'
  if (!isTest) return new Date()

  const override = env.FRITT_NOW
  if (!override) return new Date()

  const parsed = new Date(override)
  if (Number.isNaN(parsed.getTime())) {
    if (!warnedOnce) {
      warnedOnce = true
      console.warn(
        `[getNow] FRITT_NOW="${override}" is not a valid ISO date — falling back to real time`,
      )
    }
    return new Date()
  }
  return parsed
}

/**
 * Today's date in local time as YYYY-MM-DD, respecting FRITT_NOW.
 * Replaces bare todayLocal() at main-process callsites.
 */
export function todayLocalFromNow(): string {
  return localDateFromDate(getNow())
}

/**
 * Local date (YYYY-MM-DD) från en specifik Date-instans.
 * Använd för periodStart/periodEnd etc. där tiden inte är "now".
 * Undviker UTC-risk från .toISOString().slice(0, 10).
 */
export function localDateFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Local timestamp (YYYY-MM-DDTHH:MM:SS), respekterar FRITT_NOW.
 * Används för export-header, backup-filnamn, XML-timestamps.
 */
export function localTimestampFromNow(): string {
  const d = getNow()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${day}T${h}:${m}:${s}`
}
