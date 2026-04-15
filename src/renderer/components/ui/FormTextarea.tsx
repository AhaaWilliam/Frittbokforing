import type { UseEntityFormReturn } from '../../lib/use-entity-form'
import { errorIdFor } from '../../lib/a11y'

interface FormTextareaProps<TForm extends Record<string, unknown>> {
  form: UseEntityFormReturn<TForm>
  formName: string
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
  formName,
  name,
  label,
  required,
  placeholder,
  disabled,
  rows = 3,
  hint,
}: FormTextareaProps<TForm>) {
  const error = form.errors[name]
  const fieldId = `${formName}-${name}`
  const errId = error ? errorIdFor(fieldId) : undefined
  const textareaClass = `block w-full rounded-md border ${error ? 'border-red-500' : 'border-input'} bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary`

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        id={fieldId}
        data-testid={fieldId}
        value={String(form.getField(name) ?? '')}
        onChange={(e) => form.setField(name, e.target.value as TForm[typeof name])}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={errId}
        className={textareaClass}
      />
      {error && (
        <p role="alert" id={errId} className="mt-1 text-xs text-red-600">{error}</p>
      )}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
