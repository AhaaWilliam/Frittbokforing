/**
 * Default kontomappning för avskrivningsflöden enligt BAS-kontoplan.
 *
 * Varje mappning pekar anskaffningskontot (asset_account) till paret
 * {accumulated, expense} som bokför sig via avskrivningsverifikat.
 *
 * Användaren kan overrida defaults i FixedAssetForm — detta är bara
 * förslagen vid asset-typval.
 */

export interface DepreciationAccountDefaults {
  asset: string
  accumulated: string
  expense: string
  label: string
}

/**
 * Vanligaste BAS-mappningar för svenska SMB. Listan är inte uttömmande —
 * ovanliga kontogrupper kan anges manuellt i formuläret.
 */
export const DEPRECIATION_DEFAULTS: DepreciationAccountDefaults[] = [
  {
    asset: '1210',
    accumulated: '1219',
    expense: '7831',
    label: 'Maskiner och andra tekniska anläggningar',
  },
  {
    asset: '1220',
    accumulated: '1229',
    expense: '7832',
    label: 'Inventarier och verktyg',
  },
  {
    asset: '1230',
    accumulated: '1239',
    expense: '7832',
    label: 'Installationer',
  },
  {
    asset: '1240',
    accumulated: '1249',
    expense: '7834',
    label: 'Bilar och andra transportmedel',
  },
  { asset: '1250', accumulated: '1259', expense: '7833', label: 'Datorer' },
  { asset: '1110', accumulated: '1119', expense: '7820', label: 'Byggnader' },
  {
    asset: '1150',
    accumulated: '1159',
    expense: '7840',
    label: 'Markanläggningar',
  },
  {
    asset: '1010',
    accumulated: '1019',
    expense: '7810',
    label: 'Immateriella anläggningstillgångar',
  },
]

/** Slå upp defaults baserat på anskaffningskontot. Returnerar första matchningen. */
export function findDepreciationDefaults(
  assetAccount: string,
): DepreciationAccountDefaults | undefined {
  return DEPRECIATION_DEFAULTS.find((d) => d.asset === assetAccount)
}
