import { CheckLine } from '../ui/CheckLine'
import { Callout } from '../ui/Callout'
import { Pill } from '../ui/Pill'
import { formatKr } from '../../lib/format'

/**
 * Sprint 16 — ConsequencePane (ADR 006).
 *
 * Renderar live-preview av journal-lines i WorkspaceLayout's höger-zon.
 * Tre lägen:
 *
 * 1. **Idle** (ingen input) — visar tom-state med tips.
 * 2. **Pending** (request på väg) — visar skeleton/spinner-text.
 * 3. **Active** (preview-data) — visar verifikat-rader, balans-status,
 *    warnings.
 *
 * Komponenten är styrd via props — anropare (form-komponent) håller
 * input-state och anropar `useJournalPreview` separat. Det gör att
 * ConsequencePane är enkel att testa utan IPC-mocking.
 */

interface PreviewLine {
  account_number: string
  account_name: string | null
  debit_ore: number
  credit_ore: number
  description: string | null
}

interface PreviewData {
  lines: PreviewLine[]
  total_debit_ore: number
  total_credit_ore: number
  balanced: boolean
  entry_date: string
  description: string | null
  warnings: ReadonlyArray<string>
}

interface ConsequencePaneProps {
  preview: PreviewData | null
  pending: boolean
  /**
   * Senaste fel från preview-IPC. Visas som varnings-callout. Form-fel
   * (validation på enskilt fält) visas vanligtvis inline i formuläret —
   * detta är för IPC/system-fel.
   */
  error: { code: string; message: string } | null
  /**
   * Visas i idle-state. Default: generic "Fyll i formuläret för att se
   * verifikatet förhandsgranskas".
   */
  idleHint?: string
}

export function ConsequencePane({
  preview,
  pending,
  error,
  idleHint = 'Fyll i formuläret för att se verifikatet förhandsgranskas.',
}: ConsequencePaneProps) {
  // Error state — visa felet, inget annat
  if (error) {
    return (
      <div className="p-4" data-testid="consequence-pane-error">
        <Callout variant="danger" title="Förhandsgranskning misslyckades">
          {error.message}
        </Callout>
      </div>
    )
  }

  // Idle state — ingen input ännu
  if (!preview && !pending) {
    return (
      <div className="p-4" data-testid="consequence-pane-idle">
        <p className="text-sm text-neutral-500">{idleHint}</p>
      </div>
    )
  }

  // Pending state — väntar på första response
  if (!preview && pending) {
    return (
      <div className="p-4" data-testid="consequence-pane-pending">
        <p className="text-sm text-neutral-400">Beräknar...</p>
      </div>
    )
  }

  // Active — preview finns
  // (preview måste finnas vid denna punkt, men TS behöver garantin)
  if (!preview) return null

  return (
    <div
      className="flex flex-col gap-4 p-4"
      aria-live="polite"
      data-testid="consequence-pane-active"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-neutral-900">
            Verifikat-förhandsgranskning
          </h3>
          <p className="text-xs text-neutral-500">
            {preview.entry_date}
            {preview.description ? ` — ${preview.description}` : ''}
          </p>
        </div>
        <Pill
          variant={preview.balanced ? 'success' : 'warning'}
          withDot
          size="md"
        >
          {preview.balanced ? 'Balanserar' : 'Obalans'}
        </Pill>
      </div>

      {/* Tabell-vy av rader */}
      <div className="overflow-hidden rounded-md border border-neutral-200">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Konto</th>
              <th className="px-3 py-2 text-right font-medium">Debet</th>
              <th className="px-3 py-2 text-right font-medium">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line, i) => (
              <tr
                key={i}
                className="border-t border-neutral-200"
                data-testid={`preview-line-${i}`}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-neutral-700">
                    {line.account_number}
                  </div>
                  {line.account_name && (
                    <div className="text-xs text-neutral-500">
                      {line.account_name}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {line.debit_ore > 0 ? formatKr(line.debit_ore) : ''}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {line.credit_ore > 0 ? formatKr(line.credit_ore) : ''}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-medium">
              <td className="px-3 py-2 text-right text-xs uppercase tracking-wider text-neutral-500">
                Summa
              </td>
              <td
                className="px-3 py-2 text-right font-mono"
                data-testid="preview-total-debit"
              >
                {formatKr(preview.total_debit_ore)}
              </td>
              <td
                className="px-3 py-2 text-right font-mono"
                data-testid="preview-total-credit"
              >
                {formatKr(preview.total_credit_ore)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Status-rad */}
      <CheckLine
        state={preview.balanced ? 'check' : 'cross'}
        label={preview.balanced ? 'Verifikatet balanserar' : 'Obalans'}
        description={
          preview.balanced
            ? `Debet ${formatKr(preview.total_debit_ore)} = Kredit ${formatKr(preview.total_credit_ore)}`
            : `Debet ${formatKr(preview.total_debit_ore)} ≠ Kredit ${formatKr(preview.total_credit_ore)}`
        }
      />

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <Callout variant="warning" title="Att åtgärda">
          <ul className="list-inside list-disc space-y-1">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  )
}
