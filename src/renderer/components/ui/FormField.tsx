import type { UseEntityFormReturn } from '../../lib/use-entity-form'
import { errorIdFor } from '../../lib/a11y'

interface FormFieldProps<TForm extends Record<string, unknown>> {
  form: UseEntityFormReturn<TForm>
  formName: string
  name: keyof TForm & string
  label: string
  required?: boolean
  type?: 'text' | 'email' | 'number' | 'tel'
  placeholder?: string
  disabled?: boolean
  hint?: string
}

/** Strip leading underscore from internal state keys (e.g. _priceKr → priceKr) */
function stripLeadingUnderscore(name: string): string {
  return name.startsWith('_') ? name.slice(1) : name
}

export function FormField<TForm extends Record<string, unknown>>({
  form,
  formName,
  name,
  label,
  required,
  type = 'text',
  placeholder,
  disabled,
  hint,
}: FormFieldProps<TForm>) {
  const error = form.errors[name]
  const fieldId = `${formName}-${stripLeadingUnderscore(name)}`
  const errId = error ? errorIdFor(fieldId) : undefined
  const inputClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={fieldId}
        data-testid={fieldId}
        type={type}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => form.setField(name, e.target.value as TForm[typeof name])}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={errId}
        className={inputClass}
      />
      {error && (
        <p role="alert" id={errId} className="mt-1 text-xs text-red-600">{error}</p>
      )}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
