/**
 * Sprint 57 A4 — SuggestedMatchesPanel.
 *
 * Renders a collapsible panel above the bank-statement transactions table.
 * When expanded, fetches match-suggestions from the backend and displays
 * HIGH/MEDIUM candidates with per-candidate and bulk-accept buttons.
 *
 * Beslut 1: Inline i BankStatementDetail (inte separat sida).
 * Beslut 2: Bulk-accept via loop; suggester-query pausad under pending.
 * Beslut 3: Per-candidate-accept; disabled under bulk-pending.
 * Beslut 4: Hårdkodat payment_account = '1930'.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import {
  useSuggestBankMatches,
  useMatchBankTransaction,
} from '../../lib/hooks'
import { LoadingSpinner } from '../ui/LoadingSpinner'

type MatchCandidate = {
  entity_type: 'invoice' | 'expense'
  entity_id: number
  entity_number: string | null
  counterparty_name: string | null
  total_amount_ore: number
  remaining_ore: number
  entity_date: string
  due_date: string | null
  score: number
  confidence: 'HIGH' | 'MEDIUM'
  method: string
  reasons: string[]
}

type TxSuggestion = {
  bank_transaction_id: number
  candidates: MatchCandidate[]
}

function fmtKr(ore: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
  }).format(Math.abs(ore) / 100)
}

interface Props {
  statementId: number
}

export function SuggestedMatchesPanel({ statementId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const [results, setResults] = useState<
    | {
        ok: number
        total: number
        failed: Array<{ txId: number; reason: string }>
      }
    | null
  >(null)

  // Beslut 2: query pausad under bulk-pending (undviker mid-loop refetch)
  const query = useSuggestBankMatches(statementId, expanded && !pending)
  const matchMutation = useMatchBankTransaction()

  const suggestions = (query.data ?? []) as TxSuggestion[]

  const highCount = suggestions.reduce((sum, s) => {
    const isHigh =
      s.candidates.length > 0 && s.candidates[0].confidence === 'HIGH'
    return sum + (isHigh ? 1 : 0)
  }, 0)
  const mediumCount = suggestions.reduce((sum, s) => {
    const hasMedium = s.candidates.some((c) => c.confidence === 'MEDIUM')
    return sum + (hasMedium ? 1 : 0)
  }, 0)

  async function acceptCandidate(txId: number, candidate: MatchCandidate) {
    if (pending) return
    try {
      const r = await matchMutation.mutateAsync({
        bank_transaction_id: txId,
        matched_entity_type: candidate.entity_type,
        matched_entity_id: candidate.entity_id,
        payment_account: '1930',
      })
      const success = (r as { success?: boolean }).success !== false
      if (success) {
        toast.success('Matchning accepterad')
      } else {
        toast.error(
          `Matchning misslyckades: ${(r as { error?: string }).error ?? 'okänt fel'}`,
        )
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Matchning misslyckades',
      )
    }
  }

  async function acceptAllHigh() {
    if (pending) return
    // Beslut 2: snapshot candidates FÖRE loopen
    const highCandidates = suggestions
      .map((s) => ({ txId: s.bank_transaction_id, candidate: s.candidates[0] }))
      .filter(
        (x): x is { txId: number; candidate: MatchCandidate } =>
          !!x.candidate && x.candidate.confidence === 'HIGH',
      )

    if (highCandidates.length === 0) return

    setPending(true)
    setResults(null)

    let ok = 0
    const failed: Array<{ txId: number; reason: string }> = []

    for (const { txId, candidate } of highCandidates) {
      try {
        const r = await matchMutation.mutateAsync({
          bank_transaction_id: txId,
          matched_entity_type: candidate.entity_type,
          matched_entity_id: candidate.entity_id,
          payment_account: '1930',
        })
        const success = (r as { success?: boolean }).success !== false
        if (success) {
          ok++
        } else {
          failed.push({
            txId,
            reason: (r as { error?: string }).error ?? 'okänt fel',
          })
        }
      } catch (e) {
        failed.push({
          txId,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    setPending(false)
    setResults({ ok, total: highCandidates.length, failed })

    if (failed.length === 0) {
      toast.success(`${ok} av ${highCandidates.length} accepterade`)
    } else {
      toast.warning(`${ok} av ${highCandidates.length} accepterade`)
    }
  }

  return (
    <details
      className="mb-4 rounded-md border bg-accent/20"
      open={expanded}
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      data-testid="suggested-matches-panel"
    >
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
        <ChevronRight className="mr-1 inline h-4 w-4" />
        Föreslå matchningar
      </summary>

      {expanded && (
        <div className="border-t px-4 py-3">
          {query.isLoading ? (
            <LoadingSpinner />
          ) : query.isError ? (
            <div
              className="text-sm text-red-600"
              role="alert"
              data-testid="suggested-matches-error"
            >
              Kunde inte hämta förslag: {String(query.error)}
            </div>
          ) : suggestions.length === 0 ||
            suggestions.every((s) => s.candidates.length === 0) ? (
            <div
              className="text-sm text-muted-foreground"
              data-testid="suggested-matches-empty"
            >
              Inga förslag hittades
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">
                  {highCount} säkra (HIGH) · {mediumCount} möjliga (MEDIUM)
                </span>
                {highCount > 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={acceptAllHigh}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    data-testid="suggested-matches-accept-all-high"
                  >
                    Acceptera alla HIGH ({highCount})
                  </button>
                )}
              </div>

              <ul className="space-y-2 text-sm">
                {suggestions
                  .filter((s) => s.candidates.length > 0)
                  .map((s) => (
                    <li
                      key={s.bank_transaction_id}
                      className="rounded border bg-background p-2"
                      data-testid={`suggested-tx-${s.bank_transaction_id}`}
                    >
                      <div className="mb-1 text-xs text-muted-foreground">
                        TX #{s.bank_transaction_id}
                      </div>
                      {s.candidates.map((c) => (
                        <div
                          key={`${c.entity_type}-${c.entity_id}`}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <div className="flex-1 text-xs">
                            <span className="font-medium">
                              {c.entity_number ?? '—'}
                            </span>
                            {' · '}
                            {c.counterparty_name ?? '—'}
                            {' · '}
                            {fmtKr(c.total_amount_ore)}
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                                c.confidence === 'HIGH'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.confidence} {c.score}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              acceptCandidate(s.bank_transaction_id, c)
                            }
                            className="rounded border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                            data-testid={`accept-${s.bank_transaction_id}-${c.entity_type}-${c.entity_id}`}
                          >
                            Acceptera
                          </button>
                        </div>
                      ))}
                    </li>
                  ))}
              </ul>

              {results && results.failed.length > 0 && (
                <div
                  className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs"
                  role="alert"
                  data-testid="suggested-matches-failures"
                >
                  <div className="mb-1 font-medium">
                    {results.ok} av {results.total} accepterade — {results.failed.length} misslyckades:
                  </div>
                  <ul className="ml-4 list-disc">
                    {results.failed.map((f) => (
                      <li key={f.txId}>
                        TX #{f.txId}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </details>
  )
}
