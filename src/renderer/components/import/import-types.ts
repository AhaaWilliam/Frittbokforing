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

export interface AccountConflict {
  account_number: string
  existing_name: string
  new_name: string
  referenced_by_entries: number
}

export interface ValidationResult {
  valid: boolean
  errors: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  summary: ValidationSummary
  /** Sprint 57 B3a — konto-namnkonflikter vid merge. Tom array vid 'new'. */
  conflicts: AccountConflict[]
}

export type ConflictResolution = 'keep' | 'overwrite' | 'skip'

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
