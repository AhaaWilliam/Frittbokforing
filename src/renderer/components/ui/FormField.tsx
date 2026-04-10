import type { UseEntityFormReturn } from '../../lib/use-entity-form'

interface FormFieldProps<TForm extends Record<string, unknown>> {
  form: UseEntityFormReturn<TForm>
  name: keyof TForm & string
  label: string
  required?: boolean
  type?: 'text' | 'email' | 'number' | 'tel'
  placeholder?: string
  disabled?: boolean
  hint?: string
}

export function FormField<TForm extends Record<string, unknown>>({
  form,
  name,
  label,
  required,
  type = 'text',
  placeholder,
  disabled,
  hint,
}: FormFieldProps<TForm>) {
  const error = form.errors[name]
  const inputClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        type={type}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => form.setField(name, e.target.value as TForm[typeof name])}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClass}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
