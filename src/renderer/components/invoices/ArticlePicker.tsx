import { useState, useEffect, useRef, useId } from 'react'
import { useProducts } from '../../lib/hooks'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { formatKr, toKr } from '../../lib/format'
import { useComboboxKeyboard } from '../../lib/use-combobox-keyboard'
import type { Product } from '../../../shared/types'

interface ArticlePickerProps {
  counterpartyId: number | null
  onSelect: (product: {
    product_id: number
    description: string
    unit_price_kr: number
    vat_code_id: number
    vat_rate: number
    unit: string
  }) => void
  testId?: string
}

function typeBadge(articleType: Product['article_type']) {
  switch (articleType) {
    case 'service':
      return (
        <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700">
          Tj&auml;nst
        </span>
      )
    case 'goods':
      return (
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
          Vara
        </span>
      )
    case 'expense':
      return (
        <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
          Utl&auml;gg
        </span>
      )
  }
}

export function ArticlePicker({
  counterpartyId,
  onSelect,
  testId,
}: ArticlePickerProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const { activeCompany } = useActiveCompany()
  const activeCompanyId = activeCompany?.id

  const { data: products } = useProducts({
    search: debouncedSearch,
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

  async function handleSelect(product: Product) {
    let priceOre = product.default_price_ore
    if (counterpartyId && activeCompanyId) {
      try {
        const result = await window.api.getPriceForCustomer({
          company_id: activeCompanyId,
          product_id: product.id,
          counterparty_id: counterpartyId,
        })
        if (result.success) {
          priceOre = result.data.price_ore
        }
      } catch {
        // fallback to default_price_ore
      }
    }

    onSelect({
      product_id: product.id,
      description: product.description ?? product.name,
      unit_price_kr: toKr(priceOre),
      vat_code_id: product.vat_code_id,
      vat_rate: 0, // will be resolved by the parent via vat codes
      unit: product.unit,
    })
    setSearch('')
    setOpen(false)
  }

  const kb = useComboboxKeyboard({
    items: products,
    isOpen: open,
    onSelect: handleSelect,
    onClose: () => setOpen(false),
    getItemId: (_, i) => `${listboxId}-opt-${i}`,
  })

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open && !!products && products.length > 0}
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
        placeholder="S&ouml;k artikel..."
        aria-label="Sök artikel"
        data-testid={testId}
        className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {open && products && products.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Artiklar"
          className="absolute z-10 mt-1 max-h-48 w-64 overflow-auto rounded-md border bg-background shadow-lg"
        >
          {products.map((p, i) => (
            <li
              key={p.id}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={kb.isActive(i)}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => handleSelect(p)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${kb.isActive(i) ? 'bg-muted' : 'hover:bg-muted/50'}`}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatKr(p.default_price_ore)}
                  </span>
                </div>
                {typeBadge(p.article_type)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
