import { useMemo } from 'react'
import type { Counterparty } from '../../../shared/types'
import { useCreateCounterparty, useUpdateCounterparty } from '../../lib/hooks'
import { useEntityForm } from '../../lib/use-entity-form'
import { Callout } from '../ui/Callout'
import {
  CustomerFormStateSchema,
  CustomerPayloadSchema,
  transformCustomerForm,
  CUSTOMER_DEFAULTS,
} from '../../lib/form-schemas/customer'
import type {
  CustomerFormState,
  CustomerPayload,
} from '../../lib/form-schemas/customer'
import { FormField } from '../ui/FormField'
import { FormSelect } from '../ui/FormSelect'

interface CustomerFormProps {
  counterparty?: Counterparty
  onClose: () => void
  onSaved: (id: number) => void
  defaultType?: 'customer' | 'supplier'
}

const PAYMENT_TERMS_OPTIONS = [
  { value: 10, label: '10 dagar' },
  { value: 15, label: '15 dagar' },
  { value: 30, label: '30 dagar' },
  { value: 60, label: '60 dagar' },
  { value: 90, label: '90 dagar' },
]

const TYPE_OPTIONS = [
  { value: 'customer', label: 'Kund' },
  { value: 'supplier', label: 'Leverantör' },
  { value: 'both', label: 'Båda' },
]

export function CustomerForm({
  counterparty,
  onClose,
  onSaved,
  defaultType = 'customer',
}: CustomerFormProps) {
  const isEdit = !!counterparty
  const createMutation = useCreateCounterparty()
  const updateMutation = useUpdateCounterparty()

  const initialData: Partial<CustomerFormState> | undefined = counterparty
    ? {
        name: counterparty.name,
        type: counterparty.type,
        org_number: counterparty.org_number ?? '',
        vat_number: counterparty.vat_number ?? '',
        address_line1: counterparty.address_line1 ?? '',
        postal_code: counterparty.postal_code ?? '',
        city: counterparty.city ?? '',
        country: counterparty.country ?? 'Sverige',
        contact_person: counterparty.contact_person ?? '',
        email: counterparty.email ?? '',
        phone: counterparty.phone ?? '',
        default_payment_terms: counterparty.default_payment_terms,
      }
    : undefined

  const form = useEntityForm<CustomerFormState, CustomerPayload, number>({
    formSchema: CustomerFormStateSchema,
    payloadSchema: CustomerPayloadSchema,
    transform: transformCustomerForm,
    defaults: { ...CUSTOMER_DEFAULTS, type: defaultType },
    initialData,
    onSubmit: async (payload) => {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: counterparty!.id, ...payload })
        return counterparty!.id
      }
      const data = await createMutation.mutateAsync(payload)
      return data.id
    },
    onSuccess: (id) => onSaved(id),
  })

  const country = form.getField('country') as string
  const orgNumber = form.getField('org_number') as string
  const vatSuggestion = useMemo(() => {
    if (country === 'Sverige' && orgNumber.trim()) {
      return `SE${orgNumber.replace(/-/g, '')}01`
    }
    return null
  }, [country, orgNumber])

  return (
    <div className="flex flex-1 flex-col overflow-auto px-8 py-6">
      <h2 className="mb-6 text-lg font-medium">
        {isEdit ? 'Redigera kund' : 'Ny kund'}
      </h2>

      {form.submitError && (
        <div className="mb-4">
          <Callout variant="danger">{form.submitError}</Callout>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <FormField
          form={form}
          formName="customer"
          name="name"
          label="Namn"
          required
        />

        <FormSelect
          form={form}
          formName="customer"
          name="type"
          label="Typ"
          options={TYPE_OPTIONS}
        />

        <FormField
          form={form}
          formName="customer"
          name="org_number"
          label="Organisationsnummer"
          placeholder="NNNNNN-NNNN"
        />

        <FormField
          form={form}
          formName="customer"
          name="vat_number"
          label="VAT-nummer"
          hint={vatSuggestion ? `Förslag: ${vatSuggestion}` : undefined}
        />

        <FormField
          form={form}
          formName="customer"
          name="address_line1"
          label="Adress"
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            form={form}
            formName="customer"
            name="postal_code"
            label="Postnummer"
          />
          <FormField form={form} formName="customer" name="city" label="Stad" />
        </div>

        <FormField
          form={form}
          formName="customer"
          name="country"
          label="Land"
        />

        <FormField
          form={form}
          formName="customer"
          name="contact_person"
          label="Kontaktperson"
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            form={form}
            formName="customer"
            name="email"
            label="E-post"
            type="email"
          />
          <FormField
            form={form}
            formName="customer"
            name="phone"
            label="Telefon"
            type="tel"
          />
        </div>

        <FormSelect
          form={form}
          formName="customer"
          name="default_payment_terms"
          label="Betalningsvillkor"
          options={PAYMENT_TERMS_OPTIONS}
        />

        {/* Betalningsuppgifter */}
        <div className="mt-2 border-t pt-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Betalningsuppgifter
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              form={form}
              formName="customer"
              name="bankgiro"
              label="Bankgiro"
              placeholder="1234-5678"
            />
            <FormField
              form={form}
              formName="customer"
              name="plusgiro"
              label="Plusgiro"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              form={form}
              formName="customer"
              name="bank_account"
              label="Bankkonto"
            />
            <FormField
              form={form}
              formName="customer"
              name="bank_clearing"
              label="Clearingnummer"
              placeholder="1234"
            />
          </div>
        </div>

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
