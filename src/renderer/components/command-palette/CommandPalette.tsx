import { useEffect, useId, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useComboboxKeyboard } from '../../lib/use-combobox-keyboard'
import { KbdChip } from '../ui/KbdChip'
import {
  filterCommands,
  filterByMode,
  type Command,
  type CommandSection,
} from './commands'

/**
 * CommandPalette — ⌘K-paletten.
 *
 * Implementation per ADR 005 (dual-mode, palette i båda modes) och ADR 003
 * (Radix för dialog-primitives). Återanvänder `useComboboxKeyboard` (M157)
 * för fokushantering — input behåller fokus, "aktiv" rad spåras via
 * `aria-activedescendant`.
 *
 * **Egen implementation, inte cmdk-biblioteket.** Kodbasen har redan
 * combobox-mönstret etablerat; dependency-injection ger inget värde.
 *
 * Tangentbord:
 * - ⌘K (öppna/stäng) — globalt, hanteras av `useKeyboardShortcuts`
 * - ↑↓ — navigera bland resultat
 * - Home/End — första/sista
 * - Enter — aktivera valt kommando
 * - Esc — stäng
 *
 * Stängning sker automatiskt efter `command.run()` så att
 * navigations-callbacks får verkställas innan unmount.
 */

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fullständig command-lista. Filtreras per mode internt. */
  commands: ReadonlyArray<Command>
  /** Aktivt mode för filter (`Command.modes`). */
  mode: 'vardag' | 'bokforare'
}

const SECTION_LABEL: Record<CommandSection, string> = {
  navigation: 'Gå till',
  create: 'Skapa',
  view: 'Visa',
  system: 'System',
}

const SECTION_ORDER: CommandSection[] = [
  'create',
  'navigation',
  'view',
  'system',
]

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  mode,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  // Filter — först mode, sedan query
  const filtered = useMemo(() => {
    const modeScoped = filterByMode(commands, mode)
    return filterCommands(modeScoped, query)
  }, [commands, mode, query])

  // Gruppera per section, bevara stabil sektionsordning
  const grouped = useMemo(() => {
    const map = new Map<CommandSection, Command[]>()
    for (const cmd of filtered) {
      const list = map.get(cmd.section) ?? []
      list.push(cmd)
      map.set(cmd.section, list)
    }
    return SECTION_ORDER.filter((s) => map.has(s)).map((s) => ({
      section: s,
      label: SECTION_LABEL[s],
      items: map.get(s)!,
    }))
  }, [filtered])

  // Flat-list för keyboard-nav (preserverar grouped-ordning)
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  const kb = useComboboxKeyboard<Command>({
    items: flatItems,
    isOpen: open,
    onSelect: (cmd) => {
      onOpenChange(false)
      // Defer cmd.run() till efter close så Dialog hinner unmount:a innan
      // navigation triggar potentiell remount.
      queueMicrotask(() => cmd.run())
    },
    onClose: () => onOpenChange(false),
    getItemId: (cmd) => `${listboxId}-${cmd.id}`,
  })

  // Reset query när paletten stängs
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[var(--z-overlay)] bg-black/30"
          data-testid="command-palette-overlay"
        />
        <Dialog.Content
          className="fixed left-1/2 top-[20vh] z-[var(--z-command-palette)] w-[min(640px,90vw)] -translate-x-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-lg"
          aria-label="Kommandopalett"
          data-testid="command-palette"
          onOpenAutoFocus={(e) => {
            // Fokusera input istället för Dialog default
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <Dialog.Title className="sr-only">Kommandopalett</Dialog.Title>
          <Dialog.Description className="sr-only">
            Sök efter kommandon med fritext. Använd piltangenterna för att
            navigera och Enter för att aktivera.
          </Dialog.Description>

          <div className="border-b border-[var(--border-default)] p-3">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={kb.handleKeyDown}
              placeholder="Sök kommando..."
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={kb.activeId}
              className="w-full bg-transparent text-base outline-none placeholder:text-[var(--text-faint)]"
              data-testid="command-palette-input"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-label="Kommando-resultat"
            className="max-h-[60vh] overflow-y-auto py-2"
            data-testid="command-palette-list"
          >
            {flatItems.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                Inga kommandon matchar &ldquo;{query}&rdquo;
              </li>
            ) : (
              grouped.map((group) => (
                <li key={group.section}>
                  <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-[var(--text-faint)]">
                    {group.label}
                  </div>
                  <ul role="group">
                    {group.items.map((cmd) => {
                      const flatIdx = flatItems.indexOf(cmd)
                      const isActive = kb.isActive(flatIdx)
                      return (
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- WAI-ARIA listbox-pattern: keyboard hanteras på combobox-input via aria-activedescendant (M157), klick är för mus-användare. role=option är korrekt; lägg INTE till onKeyDown här eftersom det skulle dubbla keyboard-routern.
                        <li
                          key={cmd.id}
                          id={`${listboxId}-${cmd.id}`}
                          role="option"
                          aria-selected={isActive}
                          className={`mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                            isActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]/50'
                          }`}
                          onClick={() => {
                            onOpenChange(false)
                            queueMicrotask(() => cmd.run())
                          }}
                          data-testid={`command-${cmd.id}`}
                        >
                          <span className="flex items-center gap-2">
                            {cmd.icon}
                            <span>{cmd.label}</span>
                          </span>
                          {cmd.shortcut && (
                            <span className="flex items-center gap-1">
                              {cmd.shortcut.map((k, i) => (
                                <KbdChip key={i} size="sm">
                                  {k}
                                </KbdChip>
                              ))}
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <KbdChip size="sm">↑</KbdChip>
              <KbdChip size="sm">↓</KbdChip>
              navigera
            </span>
            <span className="flex items-center gap-1.5">
              <KbdChip size="sm">Enter</KbdChip>
              välj
            </span>
            <span className="flex items-center gap-1.5">
              <KbdChip size="sm">Esc</KbdChip>
              stäng
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
