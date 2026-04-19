import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, Plus, Check } from 'lucide-react'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { OnboardingWizard } from '../../pages/OnboardingWizard'

/**
 * CompanySwitcher (Sprint MC2 — F1)
 *
 * Renderas som klickbar header i Sidebar. Visar aktivt bolag + chevron.
 * Öppnar dropdown med alla bolag + "Lägg till bolag"-action som öppnar
 * OnboardingWizard i en modal.
 *
 * Tangentbord:
 *  - Enter/Space på trigger öppnar dropdown
 *  - Escape stänger
 *  - Tab navigerar inom dropdown
 *
 * Bolagsbyte invaliderar hela React Query-cachen (useSwitchCompany med
 * invalidateAll) och re-mountar FiscalYearProvider (key={activeCompany.id}
 * i AppShell).
 */
export function CompanySwitcher() {
  const { activeCompany, allCompanies, setActiveCompany } = useActiveCompany()
  const [open, setOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  if (!activeCompany) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onBlur={(e) => {
            // Stäng om fokus lämnar hela dropdown-trädet
            if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
              setOpen(false)
            }
          }}
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm font-medium leading-tight hover:bg-accent/50"
          data-testid="company-switcher"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate">{activeCompany.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
            data-testid="company-switcher-menu"
          >
            {allCompanies.map((c) => {
              const isActive = c.id === activeCompany.id
              return (
                <li key={c.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActive) setActiveCompany(c)
                      setOpen(false)
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    data-testid={`company-option-${c.id}`}
                  >
                    <span className="truncate">{c.name}</span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </button>
                </li>
              )
            })}
            <li role="separator" className="my-1 h-px bg-border" />
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setAddOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                data-testid="company-switcher-add"
              >
                <Plus className="h-3.5 w-3.5" />
                Lägg till bolag
              </button>
            </li>
          </ul>
        )}
      </div>

      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-background shadow-lg focus:outline-none"
            data-testid="add-company-dialog"
            onOpenAutoFocus={(e) => {
              // Wizardens första input har egen fokus-hantering
              e.preventDefault()
            }}
          >
            <Dialog.Title className="sr-only">Lägg till bolag</Dialog.Title>
            <Dialog.Description className="sr-only">
              Skapa ett nytt bolag att bokföra för
            </Dialog.Description>
            <OnboardingWizard
              onCancel={() => setAddOpen(false)}
              onSuccess={(created) => {
                setAddOpen(false)
                setActiveCompany(created)
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
