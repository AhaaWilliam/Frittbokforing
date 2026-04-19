import { useState, useEffect, useRef, useId, useCallback } from 'react'
import { useCounterparties, useCreateCounterparty } from '../../lib/hooks'
import { useComboboxKeyboard } from '../../lib/use-combobox-keyboard'

interface SupplierPickerProps {
  value: { id: number; name: string } | null
  onChange: (supplier: {
    id: number
    name: string
    default_payment_terms: number
  }) => void
  disabled?: boolean
  testId?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function SupplierPicker({
  value,
  onChange,
  disabled,
  testId,
  ...ariaProps
}: SupplierPickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [showInline, setShowInline] = useState(false)
  const [newName, setNewName] = useState('')
  const [newOrgNumber, setNewOrgNumber] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

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

  const handleSelect = useCallback(
    (s: { id: number; name: string; default_payment_terms: number }) => {
      onChange({
        id: s.id,
        name: s.name,
        default_payment_terms: s.default_payment_terms,
      })
      setSearch('')
      setOpen(false)
    },
    [onChange],
  )

  const trailingId = `${listboxId}-create-new`
  const kb = useComboboxKeyboard({
    items: suppliers,
    isOpen: open,
    onSelect: handleSelect,
    onClose: () => setOpen(false),
    getItemId: (_, i) => `${listboxId}-opt-${i}`,
    // "+ Ny leverantör" ingår i tangentbords-rotationen endast när inline-formen inte är öppen
    trailingAction: showInline
      ? undefined
      : { id: trailingId, onActivate: () => setShowInline(true) },
  })

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value.name}</span>
        {!disabled && (
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
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={kb.activeId}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={kb.handleKeyDown}
        placeholder="Sök leverantör..."
        disabled={disabled}
        data-testid={testId}
        aria-label="Sök leverantör"
        aria-invalid={ariaProps['aria-invalid'] || undefined}
        aria-describedby={ariaProps['aria-describedby']}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-background shadow-lg">
          <ul id={listboxId} role="listbox" aria-label="Leverantörer">
          {suppliers &&
            suppliers.map((s, i) => (
              <li
                key={s.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={kb.isActive(i)}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => handleSelect(s)}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors ${kb.isActive(i) ? 'bg-muted' : 'hover:bg-muted/50'}`}
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
          </ul>
          <div>
            {!showInline ? (
              <button
                id={trailingId}
                type="button"
                tabIndex={-1}
                onClick={() => setShowInline(true)}
                className={`flex w-full items-center gap-1 px-3 py-2 text-left text-sm font-medium text-primary ${kb.isTrailingActive() ? 'bg-muted' : 'hover:bg-muted/50'}`}
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
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- medvetet: när "skapa ny leverantör"-formuläret öppnas förväntas fokus i namn-fältet
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
          </div>
        </div>
      )}
    </div>
  )
}
