import { z } from 'zod'
import { CreateCounterpartyInputSchema } from '../../../shared/ipc-schemas'

// PayloadSchema = exakt det backend förväntar sig
export const CustomerPayloadSchema = CreateCounterpartyInputSchema
export type CustomerPayload = z.infer<typeof CustomerPayloadSchema>

// FormStateSchema = vad formuläret håller lokalt (alla strängar, inga null)
export const CustomerFormStateSchema = z.object({
  name: z.string().min(1, 'Namn är obligatoriskt').max(200),
  type: z.enum(['customer', 'supplier', 'both']),
  org_number: z.string(),
  vat_number: z.string(),
  address_line1: z.string(),
  postal_code: z.string(),
  city: z.string(),
  country: z.string(),
  contact_person: z.string(),
  email: z.string().refine(
    (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    'Ogiltig e-postadress',
  ),
  phone: z.string(),
  default_payment_terms: z.number(),
})

export type CustomerFormState = z.infer<typeof CustomerFormStateSchema>

export const CUSTOMER_DEFAULTS: CustomerFormState = {
  name: '',
  type: 'customer',
  org_number: '',
  vat_number: '',
  address_line1: '',
  postal_code: '',
  city: '',
  country: 'Sverige',
  contact_person: '',
  email: '',
  phone: '',
  default_payment_terms: 30,
}

/**
 * Mappar formulär-state → payload som backend förväntar sig.
 * Trimmar strängar och konverterar tomma strängar till null.
 */
export function transformCustomerForm(form: CustomerFormState): CustomerPayload {
  return {
    name: form.name.trim(),
    type: form.type,
    org_number: form.org_number.trim() || null,
    vat_number: form.vat_number.trim() || null,
    address_line1: form.address_line1.trim() || null,
    postal_code: form.postal_code.trim() || null,
    city: form.city.trim() || null,
    country: form.country.trim() || 'Sverige',
    contact_person: form.contact_person.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    default_payment_terms: form.default_payment_terms,
  }
}
