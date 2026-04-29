/**
 * Command registry — Sprint 15.
 *
 * Centralt register av kommandon tillgängliga via ⌘K command palette.
 * Varje kommando har stabilt id, label, valfri keywords-lista (för fuzzy-
 * matchning), valfri shortcut-hint, och en run-callback.
 *
 * Per ADR 005: command palette finns i båda modes (Vardag + Bokförare),
 * men registry filtreras per mode. För Sprint 15 levereras Bokförare-
 * registry; Vardag-specifika kommandon tillkommer i Sprint 17.
 *
 * **Inga magic strings i kallkod.** Renderer-anrop konstruerar `Command`-
 * objekt och CommandPalette renderar dem.
 */

import type { ReactNode } from 'react'

export type CommandSection = 'navigation' | 'create' | 'view' | 'system'

export interface Command {
  /** Stabilt id för React-key och keyboard-state. */
  id: string
  /** Visat namn — det användaren ser. */
  label: string
  /** Sektion för gruppering i listan. */
  section: CommandSection
  /** Extra söktermer för fuzzy-matchning. */
  keywords?: ReadonlyArray<string>
  /**
   * Shortcut-hint som visas till höger ("⌘N", "⌘⇧B"). Endast visuellt;
   * det globala keyboard-handlern hanterar genvägarna separat
   * (useKeyboardShortcuts).
   */
  shortcut?: ReadonlyArray<string>
  /** Optional ikon till vänster om label. */
  icon?: ReactNode
  /** Aktiveras vid Enter eller klick. Stänger paletten efter run(). */
  run: () => void
  /**
   * Mode-filter — om satt syns kommandot endast i de listade lägena.
   * Default: synligt i alla lägen.
   */
  modes?: ReadonlyArray<'vardag' | 'bokforare'>
}

/**
 * Filtrera kommandon mot fritext-query. Case-insensitive substring-match
 * på label + keywords. Inte "fuzzy" i Levenshtein-mening — användarens
 * input ska finnas som substring i label eller någon keyword.
 *
 * Tomt query → returnera alla.
 */
export function filterCommands(
  commands: ReadonlyArray<Command>,
  query: string,
): Command[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return [...commands]

  return commands.filter((cmd) => {
    if (cmd.label.toLowerCase().includes(trimmed)) return true
    if (cmd.keywords?.some((k) => k.toLowerCase().includes(trimmed)))
      return true
    return false
  })
}

/**
 * Filtrera kommandon mot aktivt mode.
 */
export function filterByMode(
  commands: ReadonlyArray<Command>,
  mode: 'vardag' | 'bokforare',
): Command[] {
  return commands.filter((cmd) => !cmd.modes || cmd.modes.includes(mode))
}

/**
 * Bygg ett standard-registry för Bokförare-läget. Tar `navigate`-callback
 * och returnerar lista av Command-objekt som dispatchar till routern.
 */
export function buildBokforareCommands(
  navigate: (path: string) => void,
): Command[] {
  return [
    // ── Navigation ──
    {
      id: 'nav.overview',
      label: 'Översikt',
      section: 'navigation',
      keywords: ['hem', 'dashboard', 'start'],
      run: () => navigate('/overview'),
    },
    {
      id: 'nav.income',
      label: 'Fakturor',
      section: 'navigation',
      keywords: ['kundfaktura', 'inkomst', 'försäljning'],
      run: () => navigate('/income'),
    },
    {
      id: 'nav.expenses',
      label: 'Kostnader',
      section: 'navigation',
      keywords: ['leverantör', 'utgift'],
      run: () => navigate('/expenses'),
    },
    {
      id: 'nav.manual-entries',
      label: 'Manuella verifikat',
      section: 'navigation',
      keywords: ['manual', 'journal', 'bokföringsorder'],
      run: () => navigate('/manual-entries'),
    },
    {
      id: 'nav.customers',
      label: 'Kunder',
      section: 'navigation',
      keywords: ['kontakter', 'köpare'],
      run: () => navigate('/customers'),
    },
    {
      id: 'nav.suppliers',
      label: 'Leverantörer',
      section: 'navigation',
      keywords: ['kontakter', 'säljare'],
      run: () => navigate('/suppliers'),
    },
    {
      id: 'nav.products',
      label: 'Produkter',
      section: 'navigation',
      keywords: ['varor', 'tjänster', 'artiklar'],
      run: () => navigate('/products'),
    },
    {
      id: 'nav.accounts',
      label: 'Kontoplan',
      section: 'navigation',
      keywords: ['konton', 'BAS'],
      run: () => navigate('/accounts'),
    },
    {
      id: 'nav.reports',
      label: 'Rapporter',
      section: 'navigation',
      keywords: ['BR', 'RR', 'balansräkning', 'resultaträkning'],
      run: () => navigate('/reports'),
    },
    {
      id: 'nav.tax',
      label: 'Skatt',
      section: 'navigation',
      keywords: ['skatteberäkning', 'inkomstskatt'],
      run: () => navigate('/tax'),
    },
    {
      id: 'nav.vat',
      label: 'Moms',
      section: 'navigation',
      keywords: ['mervärdesskatt', 'momsdeklaration'],
      run: () => navigate('/vat'),
    },
    {
      id: 'nav.account-statement',
      label: 'Kontoutdrag',
      section: 'navigation',
      keywords: ['konto', 'huvudbok'],
      run: () => navigate('/account-statement'),
    },
    {
      id: 'nav.aging',
      label: 'Åldersanalys',
      section: 'navigation',
      keywords: ['förfallna', 'aging'],
      run: () => navigate('/aging'),
    },
    {
      id: 'nav.budget',
      label: 'Budget',
      section: 'navigation',
      run: () => navigate('/budget'),
    },
    {
      id: 'nav.accruals',
      label: 'Periodisering',
      section: 'navigation',
      keywords: ['accrual', 'förutbetalt'],
      run: () => navigate('/accruals'),
    },
    {
      id: 'nav.fixed-assets',
      label: 'Anläggningstillgångar',
      section: 'navigation',
      keywords: ['avskrivning', 'inventarier'],
      run: () => navigate('/fixed-assets'),
    },
    {
      id: 'nav.bank-statements',
      label: 'Bank',
      section: 'navigation',
      keywords: ['kontoutdrag', 'reconciliation', 'matchning'],
      run: () => navigate('/bank-statements'),
    },
    {
      id: 'nav.export',
      label: 'Exportera',
      section: 'navigation',
      keywords: ['SIE', 'Excel', 'PDF'],
      run: () => navigate('/export'),
    },
    {
      id: 'nav.import',
      label: 'Importera',
      section: 'navigation',
      keywords: ['SIE4', 'CSV'],
      run: () => navigate('/import'),
    },
    {
      id: 'nav.settings',
      label: 'Inställningar',
      section: 'navigation',
      keywords: ['konfig', 'config'],
      run: () => navigate('/settings'),
    },

    // ── Create-snabbåtgärder ──
    {
      id: 'create.invoice',
      label: 'Ny faktura',
      section: 'create',
      keywords: ['kundfaktura', 'income', 'sälja'],
      shortcut: ['⌘', 'N'],
      run: () => navigate('/income/create'),
    },
    {
      id: 'create.expense',
      label: 'Ny kostnad',
      section: 'create',
      keywords: ['leverantörsfaktura', 'expense', 'köpa'],
      run: () => navigate('/expenses/create'),
    },
    {
      id: 'create.manual-entry',
      label: 'Ny manuell verifikation',
      section: 'create',
      keywords: ['journal', 'manual', 'bokföringsorder'],
      run: () => navigate('/manual-entries/create'),
    },
    {
      id: 'create.customer',
      label: 'Ny kund',
      section: 'create',
      run: () => navigate('/customers/create'),
    },
    {
      id: 'create.supplier',
      label: 'Ny leverantör',
      section: 'create',
      run: () => navigate('/suppliers/create'),
    },
    {
      id: 'create.product',
      label: 'Ny produkt',
      section: 'create',
      run: () => navigate('/products/create'),
    },
  ]
}

/**
 * System-kommandon — t.ex. mode-byte. Tar separata callbacks som inte
 * är navigation. Splittas från `buildBokforareCommands` för att hålla
 * registry-byggnad rent navigation-fokuserad.
 */
export function buildSystemCommands(callbacks: {
  switchToVardag: () => void
}): Command[] {
  return [
    {
      id: 'system.switch-to-vardag',
      label: 'Byt till Vardag-läge',
      section: 'system',
      keywords: ['mode', 'läge', 'vardag', 'enkel'],
      run: callbacks.switchToVardag,
      modes: ['bokforare'],
    },
  ]
}
