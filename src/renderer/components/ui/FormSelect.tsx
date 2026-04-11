import type { UseEntityFormReturn } from '../../lib/use-entity-form'

interface FormSelectProps<TForm extends Record<string, unknown>> {
  form: UseEntityFormReturn<TForm>
  formName: string
  name: keyof TForm & string
  label: string
  options: { value: string | number; label: string }[]
  required?: boolean
  disabled?: boolean
}

export function FormSelect<TForm extends Record<string, unknown>>({
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
  const testId = `${formName}-${name}`
  const selectClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        id={name}
        data-testid={testId}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => {
          const val = isNumeric ? Number(e.target.value) : e.target.value
          form.setField(name, val as TForm[typeof name])
        }}
        disabled={disabled}
        className={selectClass}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
