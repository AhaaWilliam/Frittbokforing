/**
 * Formatterings-helpers för monetära belopp.
 *
 * Kanonisk plats för öre → kronor-formattering. Hårdkodning av `/100` eller
 * `toLocaleString('sv-SE')` i service-kod är förbjuden — importera härifrån.
 *
 * M131/regel 9: belopp lagras som öre (INTEGER); kronor är en presentations-
 * konvertering, aldrig en beräkningsbas.
 */

export interface FormatOreOptions {
  /** Visa absolutvärde (ingen minustecken). Default: false (signerad). */
  absolute?: boolean
  /** Lägg till " kr"-suffix. Default: false. */
  suffix?: boolean
  /** Min decimaler. Default: 2. */
  minFractionDigits?: number
  /** Max decimaler. Default: 2. */
  maxFractionDigits?: number
  /** Använd non-breaking space som tusentalsavskiljare (för PDF). Default: false. */
  nbspGroup?: boolean
}

export function oreToKr(ore: number): number {
  return ore / 100
}

export function formatOreToKr(
  ore: number,
  opts: FormatOreOptions = {},
): string {
  const {
    absolute = false,
    suffix = false,
    minFractionDigits = 2,
    maxFractionDigits = 2,
    nbspGroup = false,
  } = opts
  const value = absolute ? Math.abs(ore) / 100 : ore / 100
  let out = value.toLocaleString('sv-SE', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  })
  if (nbspGroup) out = out.replace(/\s/g, '\u00A0')
  if (suffix) out = `${out} kr`
  return out
}
