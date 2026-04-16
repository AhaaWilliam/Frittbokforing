export type ImportStrategy = 'new' | 'merge'

export interface ValidationSummary {
  accounts: number
  entries: number
  lines: number
  fiscalYears: number
  sieType: number | null
  programName: string | null
  companyName: string | null
  orgNumber: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  summary: ValidationSummary
}

export interface ImportResult {
  companyId: number
  fiscalYearId: number
  accountsAdded: number
  accountsUpdated: number
  entriesImported: number
  linesImported: number
  warnings: string[]
}

export type Phase = 'select' | 'validating' | 'preview' | 'importing' | 'done'
