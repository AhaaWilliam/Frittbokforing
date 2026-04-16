import { useState, useRef, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useGlobalSearch, useDebouncedSearch } from '../../lib/hooks'
import { useNavigate } from '../../lib/router'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { SearchResult, SearchResultType } from '../../../shared/search-types'

const TYPE_LABELS: Record<SearchResultType, string> = {
  invoice: 'Fakturor',
  expense: 'Kostnader',
  customer: 'Kunder',
  supplier: 'Leverantörer',
  product: 'Artiklar',
  account: 'Konton',
  journal_entry: 'Verifikat',
}

const TYPE_ORDER: SearchResultType[] = [
  'invoice',
  'expense',
  'customer',
  'supplier',
  'product',
  'account',
  'journal_entry',
]

const MAX_PER_GROUP = 5
const MAX_TOTAL = 20

function groupResults(results: SearchResult[]): Map<SearchResultType, SearchResult[]> {
  const groups = new Map<SearchResultType, SearchResult[]>()
  for (const r of results) {
    let list = groups.get(r.type)
    if (!list) {
      list = []
      groups.set(r.type, list)
    }
    if (list.length < MAX_PER_GROUP) {
      list.push(r)
    }
  }
  return groups
}

function flattenGroups(groups: Map<SearchResultType, SearchResult[]>): SearchResult[] {
  const flat: SearchResult[] = []
  for (const type of TYPE_ORDER) {
    const items = groups.get(type)
    if (items) flat.push(...items)
  }
  return flat.slice(0, MAX_TOTAL)
}

export function GlobalSearch() {
  const { activeFiscalYear } = useFiscalYearContext()
  const navigate = useNavigate()
  const { search, debouncedSearch, setSearch } = useDebouncedSearch(300)

  const { data, isLoading } = useGlobalSearch(
    activeFiscalYear?.id,
    debouncedSearch,
  )

  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = data?.results ?? []
  const grouped = groupResults(results)
  const flatResults = flattenGroups(grouped)

  const handleSelect = useCallback(
    (result: SearchResult) => {
      navigate(result.route)
      setSearch('')
      setIsOpen(false)
      setActiveIndex(-1)
      inputRef.current?.blur()
    },
    [navigate, setSearch],
  )

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1)
  }, [debouncedSearch])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
      inputRef.current?.blur()
      return
    }

    if (!isOpen || flatResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleSelect(flatResults[activeIndex])
    }
  }

  const showDropdown = isOpen && search.length >= 2

  // Build grouped display with headers
  const displayGroups: Array<{ type: SearchResultType; label: string; items: SearchResult[] }> = []
  for (const type of TYPE_ORDER) {
    const items = grouped.get(type)
    if (items && items.length > 0) {
      displayGroups.push({ type, label: TYPE_LABELS[type], items })
    }
  }

  // Map flat index to group items
  let flatIdx = 0

  return (
    <div ref={containerRef} className="relative px-4 pb-3 pt-2">
      <div
        role="combobox"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-owns={showDropdown ? 'search-results' : undefined}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            role="searchbox"
            aria-autocomplete="list"
            aria-controls={showDropdown ? 'search-results' : undefined}
            aria-activedescendant={showDropdown && activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
            placeholder="Sök (Ctrl+K)..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setIsOpen(true)
              setActiveIndex(-1)
            }}
            onFocus={() => {
              if (search.length >= 2) setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {showDropdown && (
          <ul
            id="search-results"
            role="listbox"
            aria-label="Sökresultat"
            className="absolute left-4 right-4 z-50 mt-1 max-h-80 overflow-auto rounded-md border bg-popover shadow-lg"
          >
            {isLoading ? (
              <li className="flex items-center justify-center py-4">
                <LoadingSpinner />
              </li>
            ) : flatResults.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                Inga resultat för &ldquo;{search}&rdquo;
              </li>
            ) : (
              displayGroups.map((group) => {
                const header = (
                  <li
                    key={`header-${group.type}`}
                    className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    role="presentation"
                  >
                    {group.label} ({group.items.length})
                  </li>
                )
                const items = group.items.map((item) => {
                  const idx = flatIdx++
                  return (
                    <li
                      key={`${item.type}-${item.identifier}`}
                      id={`search-result-${idx}`}
                      role="option"
                      aria-selected={idx === activeIndex}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                        idx === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                      }`}
                    >
                      <span className="truncate font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{item.subtitle}</span>
                    </li>
                  )
                })
                return [header, ...items]
              })
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
