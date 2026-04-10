import type { UseEntityFormReturn } from '../../lib/use-entity-form'

interface FormTextareaProps<TForm extends Record<string, unknown>> {
  form: UseEntityFormReturn<TForm>
  name: keyof TForm & string
  label: string
  required?: boolean
  placeholder?: string
  disabled?: boolean
  rows?: number
  hint?: string
}

export function FormTextarea<TForm extends Record<string, unknown>>({
  form,
  name,
  label,
  required,
  placeholder,
  disabled,
  rows = 3,
  hint,
}: FormTextareaProps<TForm>) {
  const error = form.errors[name]
  const textareaClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        id={name}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => form.setField(name, e.target.value as TForm[typeof name])}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={textareaClass}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
