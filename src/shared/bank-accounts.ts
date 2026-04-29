/**
 * Bank-/likvida-konto-konstanter (BAS 2014, klass 19).
 *
 * Enda källan för bank-konto-listan i systemet. Hårdkodning i service-kod är
 * förbjuden — importera härifrån.
 *
 * Scope: 1910 Kassa, 1920 PlusGiro, 1930 Företagskonto. Övriga klass 19-konton
 * (1940 övriga bankkonton, 1960 specialkonton) inkluderas inte tills användare
 * kräver det — då lägg till här.
 */

export const BANK_KASSA = '1910' as const
export const BANK_PLUSGIRO = '1920' as const
export const BANK_FORETAGSKONTO = '1930' as const

export const BANK_ACCOUNTS = [
  BANK_KASSA,
  BANK_PLUSGIRO,
  BANK_FORETAGSKONTO,
] as const
