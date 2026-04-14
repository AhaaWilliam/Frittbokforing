import { useState, useEffect, useRef } from 'react'
import { useCounterparties, useCreateCounterparty } from '../../lib/hooks'

interface SupplierPickerProps {
  value: { id: number; name: string } | null
  onChange: (supplier: {
    id: number
    name: string
    default_payment_terms: number
  }) => void
  disabled?: boolean
}

export function SupplierPicker({
  value,
  onChange,
  disabled,
}: SupplierPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [showInline, setShowInline] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOrgNumber, setNewOrgNumber] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: suppliers } = useCounterparties({
    search: debouncedSearch,
    type: 'supplier',
    active_only: true,
  })

  const createMutation = useCreateCounterparty()

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

  async function handleCreateInline() {
    if (!newName.trim()) return
    try {
      const data = await createMutation.mutateAsync({
        name: newName.trim(),
        type: 'supplier',
        org_number: newOrgNumber.trim() || null,
      })
      onChange({
        id: data.id,
        name: newName.trim(),
        default_payment_terms: 30,
      })
      setNewName('')
      setNewOrgNumber('')
      setShowInline(false)
      setOpen(false)
    } catch {
      // Error handled by global onError
    }
  }

  function handleClear() {
    setSearch('')
    setDebouncedSearch('')
  }

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
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
        )}
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
        placeholder="Sök leverantör..."
        disabled={disabled}
        aria-label="Sök leverantör"
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {suppliers &&
            suppliers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({
                      id: s.id,
                      name: s.name,
                      default_payment_terms: s.default_payment_terms,
                    })
                    setSearch('')
                    setOpen(false)
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="font-medium">{s.name}</span>
                  {s.org_number && (
                    <span className="text-xs text-muted-foreground">
                      {s.org_number}
                    </span>
                  )}
                </button>
              </li>
            ))}
          <li>
            {!showInline ? (
              <button
                type="button"
                onClick={() => setShowInline(true)}
                className="flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted/50"
              >
                + Ny leverantör
              </button>
            ) : (
              <div className="space-y-2 border-t px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Namn"
                  aria-label="Nytt leverantörsnamn"
                  className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  autoFocus
                />
                <input
                  type="text"
                  value={newOrgNumber}
                  onChange={(e) => setNewOrgNumber(e.target.value)}
                  placeholder="Org.nr (valfritt)"
                  aria-label="Organisationsnummer"
                  className="block w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreateInline}
                    disabled={!newName.trim() || createMutation.isPending}
                    className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Skapar...' : 'Skapa'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInline(false)
                      setNewName('')
                      setNewOrgNumber('')
                    }}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            )}
          </li>
        </ul>
      )}
    </div>
  )
}
