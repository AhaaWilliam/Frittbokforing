import { useState, useEffect, useRef } from 'react'
import { useCounterparties } from '../../lib/hooks'

interface CustomerPickerProps {
  value: { id: number; name: string } | null
  onChange: (counterparty: {
    id: number
    name: string
    default_payment_terms: number
  }) => void
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function CustomerPicker({ value, onChange, ...ariaProps }: CustomerPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: customers } = useCounterparties({
    search: debouncedSearch,
    type: 'customer',
    active_only: true,
  })

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleClear() {
    setSearch('')
    setDebouncedSearch('')
    // We don't call onChange here — the parent resets customer separately
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value.name}</span>
        <button
          type="button"
          onClick={handleClear}
          aria-label="Rensa val"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="S&ouml;k kund..."
        aria-label="Sök kund"
        aria-invalid={ariaProps['aria-invalid'] || undefined}
        aria-describedby={ariaProps['aria-describedby']}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {open && customers && customers.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    id: c.id,
                    name: c.name,
                    default_payment_terms: c.default_payment_terms,
                  })
                  setSearch('')
                  setOpen(false)
                }}
                className="flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="font-medium">{c.name}</span>
                {c.org_number && (
                  <span className="text-xs text-muted-foreground">
                    {c.org_number}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
