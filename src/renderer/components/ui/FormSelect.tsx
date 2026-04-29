import type { UseEntityFormReturn } from '../../lib/use-entity-form'
import { errorIdFor } from '../../lib/a11y'
import { FieldError } from './FieldError'

interface FormSelectProps<TForm extends object> {
  form: UseEntityFormReturn<TForm>
  formName: string
  name: keyof TForm & string
  label: string
  options: { value: string | number; label: string }[]
  required?: boolean
  disabled?: boolean
}

export function FormSelect<TForm extends object>({
  form,
  formName,
  name,
  label,
  options,
  required,
  disabled,
}: FormSelectProps<TForm>) {
  const error = form.errors[name]
  const isNumeric = typeof options[0]?.value === 'number'
  const fieldId = `${formName}-${name}`
  const errId = error ? errorIdFor(fieldId) : undefined
  const selectClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-foreground mb-1"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        id={fieldId}
        data-testid={fieldId}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => {
          const val = isNumeric ? Number(e.target.value) : e.target.value
          form.setField(name, val as TForm[typeof name])
        }}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={errId}
        className={selectClass}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <FieldError id={errId}>{error}</FieldError>}
    </div>
  )
}
