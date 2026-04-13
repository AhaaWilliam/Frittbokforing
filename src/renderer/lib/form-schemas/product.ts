import { z } from 'zod'
import { CreateProductInputSchema } from '../../../shared/ipc-schemas'
import { toOre } from '../format'

export const ProductPayloadSchema = CreateProductInputSchema
export type ProductPayload = z.infer<typeof ProductPayloadSchema>

export const ProductFormStateSchema = z.object({
  name: z.string().min(1, 'Namn är obligatoriskt').max(200),
  description: z.string(),
  article_type: z.enum(['service', 'goods', 'expense']),
  unit: z.enum(['timme', 'styck', 'dag', 'månad', 'km', 'pauschal']),
  _priceKr: z.string().refine(
    (v) => v === '' || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0),
    'Ange ett giltigt pris',
  ),
  vat_code_id: z.number().int().positive('Välj en momskod'),
  account_id: z.number().int().positive('Välj ett konto'),
})

export type ProductFormState = z.infer<typeof ProductFormStateSchema>

export const PRODUCT_DEFAULTS: ProductFormState = {
  name: '',
  description: '',
  article_type: 'service',
  unit: 'timme',
  _priceKr: '',
  vat_code_id: 0,
  account_id: 0,
}

/**
 * Mappar formulär-state → payload som backend förväntar sig.
 * _priceKr (kr-sträng) konverteras till default_price_ore (öre-heltal).
 */
export function transformProductForm(form: ProductFormState): ProductPayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    article_type: form.article_type,
    unit: form.unit,
    default_price_ore: toOre(parseFloat(form._priceKr) || 0),
    vat_code_id: form.vat_code_id,
    account_id: form.account_id,
  }
}
