/**
 * MT940 transaction-type-code → ISO 20022 BkTxCd-mappning.
 *
 * Sprint Q T3.d: möjliggör att classifier (bank-fee-classifier.ts)
 * funkar med MT940-imports utan ändring — MT940:s 4-char koder
 * översätts till samma Domn/Fmly/SubFmlyCd-hierarki som camt.053.
 *
 * Subset av ISO 9362-koder — utökas vid behov. Okända koder
 * lämnas som bank_transaction_code utan BkTxCd-populering.
 */

export interface BkTxCd {
  domain: string
  family: string
  subfamily: string
}

export const BK_TX_CODE_MAP: Record<string, BkTxCd> = {
  // Charges (bank-fee-viktig för classifier)
  NCHG: { domain: 'PMNT', family: 'CCRD', subfamily: 'CHRG' },
  // Interest (classifier-viktig)
  NINT: { domain: 'PMNT', family: 'CCRD', subfamily: 'INTR' },
  // Standing order credit (recurring incoming)
  NTRF: { domain: 'ACMT', family: 'RCDT', subfamily: 'STDO' },
  // Direct debit
  NDDT: { domain: 'ACMT', family: 'DD', subfamily: 'PMDD' },
  // Generic debit/credit
  NMSC: { domain: 'PMNT', family: 'ICDT', subfamily: 'DMCT' },
  NCOM: { domain: 'PMNT', family: 'ICDT', subfamily: 'DMCT' },
}
