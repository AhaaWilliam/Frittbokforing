import { z } from 'zod'
import { SaveManualEntryDraftSchema } from '../../../shared/ipc-schemas'

const ManualEntryLineFormSchema = z.object({
  key: z.string(),
  accountNumber: z.string(),
  debitKr: z.string(),
  creditKr: z.string(),
  description: z.string(),
})

export type ManualEntryLineForm = z.infer<typeof ManualEntryLineFormSchema>

export const ManualEntryFormStateSchema = z.object({
  entryDate: z.string().min(1, 'Välj datum'),
  description: z.string(),
  lines: z.array(ManualEntryLineFormSchema).min(1, 'Lägg till minst en rad'),
})

export type ManualEntryFormState = z.infer<typeof ManualEntryFormStateSchema>

export const ManualEntrySavePayloadSchema = SaveManualEntryDraftSchema
export type ManualEntrySavePayload = z.infer<typeof ManualEntrySavePayloadSchema>

export function parseSwedishAmount(input: string): number {
  if (!input || input.trim() === '') return 0
  const sanitized = input.replace(/\s/g, '').replace(',', '.')
  const value = parseFloat(sanitized)
  if (isNaN(value)) return 0
  return Math.round(value * 100)
}

export function makeEmptyManualLine(): ManualEntryLineForm {
  return {
    key: crypto.randomUUID(),
    accountNumber: '',
    debitKr: '',
    creditKr: '',
    description: '',
  }
}

/** Factory — INTE en konstant. Varje anrop skapar färska lines med unika keys. */
export function makeManualEntryDefaults(): ManualEntryFormState {
  return {
    entryDate: '',
    description: '',
    lines: [makeEmptyManualLine(), makeEmptyManualLine(), makeEmptyManualLine()],
  }
}

export function transformManualEntryForm(
  form: ManualEntryFormState,
  fiscalYearId: number,
): ManualEntrySavePayload {
  return {
    fiscal_year_id: fiscalYearId,
    entry_date: form.entryDate,
    description: form.description,
    lines: form.lines
      .filter(l =>
        l.accountNumber !== '' &&
        (parseSwedishAmount(l.debitKr) > 0 || parseSwedishAmount(l.creditKr) > 0)
      )
      .map(l => ({
        account_number: l.accountNumber,
        debit_ore: parseSwedishAmount(l.debitKr),
        credit_ore: parseSwedishAmount(l.creditKr),
        description: l.description || undefined,
      })),
  }
}
