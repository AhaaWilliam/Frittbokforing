import { useEffect } from 'react'
import type { Product } from '../../../shared/types'
import { ARTICLE_TYPE_DEFAULTS } from '../../../shared/types'
import { toKr } from '../../lib/format'
import {
  useCreateProduct,
  useUpdateProduct,
  useVatCodes,
  useAccounts,
  useCompany,
} from '../../lib/hooks'
import { useEntityForm } from '../../lib/use-entity-form'
import {
  ProductFormStateSchema,
  ProductPayloadSchema,
  transformProductForm,
  PRODUCT_DEFAULTS,
} from '../../lib/form-schemas/product'
import type { ProductFormState, ProductPayload } from '../../lib/form-schemas/product'
import { FormField } from '../ui/FormField'
import { FormSelect } from '../ui/FormSelect'
import { FormTextarea } from '../ui/FormTextarea'

interface ProductFormProps {
  product?: Product
  onClose: () => void
  onSaved: (id: number) => void
}

type ArticleType = Product['article_type']

const UNIT_OPTIONS = [
  { value: 'timme', label: 'Timme' },
  { value: 'styck', label: 'Styck' },
  { value: 'dag', label: 'Dag' },
  { value: 'månad', label: 'Månad' },
  { value: 'km', label: 'Km' },
  { value: 'pauschal', label: 'Fast pris' },
]

function vatLabel(ratePercent: number): string {
  if (ratePercent === 0) return 'Momsfritt'
  return `${ratePercent}%`
}

export function ProductForm({ product, onClose, onSaved }: ProductFormProps) {
  const isEdit = !!product
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const { data: company } = useCompany()
  const { data: vatCodes } = useVatCodes('outgoing')
  const { data: accounts } = useAccounts(company?.fiscal_rule ?? 'K2', 3, true)

  const initialData: Partial<ProductFormState> | undefined = product
    ? {
        name: product.name,
        description: product.description ?? '',
        article_type: product.article_type,
        unit: product.unit,
        _priceKr: String(toKr(product.default_price)),
        vat_code_id: product.vat_code_id,
        account_id: product.account_id,
      }
    : undefined

  const form = useEntityForm<ProductFormState, ProductPayload, number>({
    formSchema: ProductFormStateSchema,
    payloadSchema: ProductPayloadSchema,
    transform: transformProductForm,
    defaults: PRODUCT_DEFAULTS,
    initialData,
    onSubmit: async (payload) => {
      if (isEdit) {
        await updateMutation.mutateAsync({ ...payload, id: product!.id })
        return product!.id
      }
      const data = await createMutation.mutateAsync(payload)
      return data.id
    },
    onSuccess: (id) => onSaved(id),
  })

  // Set initial vat code when codes load
  useEffect(() => {
    if (vatCodes?.length && form.getField('vat_code_id') === 0) {
      form.setField('vat_code_id', vatCodes[0].id)
    }
  }, [vatCodes])

  // Set initial account when accounts load
  useEffect(() => {
    if (accounts?.length && form.getField('account_id') === 0) {
      const defaults = ARTICLE_TYPE_DEFAULTS[form.getField('article_type')]
      const match = accounts.find((a) => a.account_number === defaults.account_number)
      form.setField('account_id', match?.id ?? accounts[0].id)
    }
  }, [accounts])

  function handleArticleTypeChange(newType: ArticleType) {
    form.setField('article_type', newType)
    const defaults = ARTICLE_TYPE_DEFAULTS[newType]
    form.setField('unit', defaults.unit)
    if (accounts) {
      const match = accounts.find((a) => a.account_number === defaults.account_number)
      if (match) form.setField('account_id', match.id)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto px-8 py-6">
      <h2 className="mb-6 text-lg font-medium">
        {isEdit ? 'Redigera artikel' : 'Ny artikel'}
      </h2>

      {form.submitError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {form.submitError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <FormField form={form} name="name" label="Namn" required />

        <FormTextarea form={form} name="description" label="Beskrivning" />

        {/* Article type radio buttons */}
        <div>
          <span className="block text-sm font-medium text-foreground mb-1">Artikeltyp</span>
          <div className="flex gap-4">
            {(
              [
                { value: 'service', label: 'Tjänst' },
                { value: 'goods', label: 'Vara' },
                { value: 'expense', label: 'Utlägg' },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="article_type"
                  value={opt.value}
                  checked={form.getField('article_type') === opt.value}
                  onChange={() => handleArticleTypeChange(opt.value)}
                  className="accent-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <FormSelect form={form} name="unit" label="Enhet" options={UNIT_OPTIONS} />

        <FormField form={form} name="_priceKr" label="Standardpris (kr)" type="number" />

        <FormSelect
          form={form}
          name="vat_code_id"
          label="Momskod"
          options={vatCodes?.map((vc) => ({ value: vc.id, label: vatLabel(vc.rate_percent) })) ?? []}
        />

        <FormSelect
          form={form}
          name="account_id"
          label="Konto"
          options={accounts?.map((a) => ({ value: a.id, label: a.name })) ?? []}
        />

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={form.isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {form.isSubmitting ? 'Sparar...' : 'Spara'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Avbryt
          </button>
        </div>
      </form>
    </div>
  )
}
