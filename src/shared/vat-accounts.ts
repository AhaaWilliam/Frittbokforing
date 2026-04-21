/**
 * Momskontokonstanter (BAS 2014).
 *
 * Enda källan för moms-BAS-konton i systemet. Hårdkodning i service-kod är
 * förbjuden — importera härifrån. Se M-P2 (nattgranskning 2026-04-22).
 *
 * Tech debt: EU-moms (2614/2615 omvänd skattskyldighet) kräver dynamisk
 * mappning via `vat_codes`-tabellen, inte konstanter. Läggs till vid behov.
 */

export const VAT_OUT_25_ACCOUNT = '2610' as const
export const VAT_OUT_12_ACCOUNT = '2620' as const
export const VAT_OUT_6_ACCOUNT = '2630' as const
export const VAT_IN_ACCOUNT = '2640' as const

export const VAT_OUTGOING_ACCOUNTS = [
  VAT_OUT_25_ACCOUNT,
  VAT_OUT_12_ACCOUNT,
  VAT_OUT_6_ACCOUNT,
] as const

export const ALL_VAT_ACCOUNTS = [
  ...VAT_OUTGOING_ACCOUNTS,
  VAT_IN_ACCOUNT,
] as const
