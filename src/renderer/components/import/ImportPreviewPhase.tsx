import { CheckCircle2, XCircle } from 'lucide-react'
import { Callout } from '../ui/Callout'
import type {
  ImportStrategy,
  ValidationResult,
  ConflictResolution,
} from './import-types'

export function ImportPreviewPhase({
  validation,
  strategy,
  onStrategyChange,
  onImport,
  onCancel,
  conflictResolutions = {},
  onConflictResolutionChange,
}: {
  validation: ValidationResult
  strategy: ImportStrategy
  onStrategyChange: (s: ImportStrategy) => void
  onImport: () => void
  onCancel: () => void
  /** Sprint 57 B3b — per-konto resolution. Default {} ⇒ alla 'keep'. */
  conflictResolutions?: Record<string, ConflictResolution>
  onConflictResolutionChange?: (
    accountNumber: string,
    resolution: ConflictResolution,
  ) => void
}) {
  const { summary, errors, warnings, valid, conflicts } = validation
  const showConflicts =
    strategy === 'merge' && conflicts && conflicts.length > 0

  // V6 invariant-blockad: skip på konto som refereras av verifikat blockerar import
  const hasInvalidSkip = !!conflicts?.some(
    (c) =>
      conflictResolutions[c.account_number] === 'skip' &&
      c.referenced_by_entries > 0,
  )

  return (
    <div className="mx-auto max-w-3xl py-8">
      <h2 className="mb-4 text-lg font-medium">Valideringsresultat</h2>

      <div className="mb-6 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          {valid ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-success-600" />
              <span className="font-medium text-success-700">
                Filen är giltig
              </span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-danger-500" />
              <span role="alert" className="font-medium text-danger-700">
                {errors.length} blockerande fel
              </span>
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Företag</dt>
          <dd>{summary.companyName ?? '—'}</dd>
          <dt className="text-muted-foreground">Organisationsnummer</dt>
          <dd>{summary.orgNumber ?? '—'}</dd>
          <dt className="text-muted-foreground">SIE-typ</dt>
          <dd>{summary.sieType ?? '—'}</dd>
          <dt className="text-muted-foreground">Räkenskapsår</dt>
          <dd>{summary.fiscalYears}</dd>
          <dt className="text-muted-foreground">Konton</dt>
          <dd>{summary.accounts}</dd>
          <dt className="text-muted-foreground">Verifikationer</dt>
          <dd>{summary.entries}</dd>
          <dt className="text-muted-foreground">Transaktionsrader</dt>
          <dd>{summary.lines}</dd>
        </dl>
      </div>

      {errors.length > 0 && (
        <div className="mb-4">
          <Callout variant="danger" title="Blockerande fel">
            <ul className="space-y-1">
              {errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">[{e.code}]</span> {e.message}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4">
          <Callout
            variant="warning"
            title={`${warnings.length} varningar (icke-blockerande)`}
          >
            <ul className="max-h-32 space-y-1 overflow-auto">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-mono">[{w.code}]</span> {w.message}
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      )}

      {valid && (
        <div className="mb-6 rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">Import-strategi</h3>
          <div className="space-y-2">
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- radio-input är sibling, tillhörande text finns i nested div (tillgänglig via label-textContent för screen readers) */}
            <label
              htmlFor="import-strategy-new"
              className="flex items-start gap-2"
            >
              <input
                id="import-strategy-new"
                type="radio"
                name="strategy"
                value="new"
                checked={strategy === 'new'}
                onChange={() => onStrategyChange('new')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Ny databas</div>
                <div className="text-xs text-muted-foreground">
                  Skapa företag, räkenskapsår, kontoplan och verifikationer från
                  filen. Kräver att databasen är tom.
                </div>
              </div>
            </label>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- radio-input är sibling, tillhörande text finns i nested div (tillgänglig via label-textContent för screen readers) */}
            <label
              htmlFor="import-strategy-merge"
              className="flex items-start gap-2"
            >
              <input
                id="import-strategy-merge"
                type="radio"
                name="strategy"
                value="merge"
                checked={strategy === 'merge'}
                onChange={() => onStrategyChange('merge')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Slå samman (merge)</div>
                <div className="text-xs text-muted-foreground">
                  Matchar befintligt företag via orgNr, lägger till saknade
                  konton, importerar verifikationer i ny serie ("I" för Import).
                </div>
              </div>
            </label>
          </div>

          {strategy === 'merge' && (
            <div className="mt-4">
              <Callout
                variant="warning"
                title="Merge-läge — bekräfta innan import:"
                data-testid="sie4-merge-warning"
              >
                <ul className="ml-4 list-disc space-y-0.5 text-xs">
                  <li>
                    Befintligt företag uppdateras till filens namn om de skiljer
                    sig.
                  </li>
                  <li>Saknade konton i DB läggs till från filen.</li>
                  <li>
                    Konton som existerar i båda behåller DB:s namn och
                    inställningar.
                  </li>
                  <li>
                    Verifikationer bokförs i{' '}
                    <span className="font-mono">I</span>-serien — kollision med
                    befintliga I-nummer är inte möjlig (nästa lediga nummer
                    används).
                  </li>
                </ul>
              </Callout>
            </div>
          )}
        </div>
      )}

      {showConflicts && (
        <div
          className="mb-6 rounded-lg border p-4"
          data-testid="sie4-conflicts-section"
        >
          <h3 className="mb-3 text-sm font-medium">
            Konto-konflikter ({conflicts.length})
          </h3>
          <div className="space-y-4">
            {conflicts.map((c) => {
              const resolution: ConflictResolution =
                conflictResolutions[c.account_number] ?? 'keep'
              const invalidSkip =
                resolution === 'skip' && c.referenced_by_entries > 0
              return (
                <div
                  key={c.account_number}
                  className="rounded border p-3"
                  data-testid={`conflict-${c.account_number}`}
                >
                  <div className="mb-2 text-sm font-medium">
                    {c.account_number} — "{c.existing_name}" (existerande) vs "
                    {c.new_name}" (SIE)
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(['keep', 'overwrite', 'skip'] as const).map((r) => (
                      <label key={r} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`conflict-${c.account_number}`}
                          value={r}
                          checked={resolution === r}
                          onChange={() =>
                            onConflictResolutionChange?.(c.account_number, r)
                          }
                          data-testid={`conflict-${c.account_number}-${r}`}
                        />
                        {r === 'keep'
                          ? 'Behåll existerande (default)'
                          : r === 'overwrite'
                            ? 'Skriv över'
                            : 'Skippa konto'}
                      </label>
                    ))}
                  </div>
                  {invalidSkip && (
                    <div
                      role="alert"
                      className="mt-2 rounded bg-danger-100/40 p-2 text-xs text-danger-700"
                      data-testid={`conflict-${c.account_number}-invalid-skip`}
                    >
                      ⚠ Skip av {c.account_number}: {c.referenced_by_entries}{' '}
                      verifikat refererar detta konto. Importen kan inte
                      genomföras. Välj "Behåll" eller "Skriv över".
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Avbryt
        </button>
        {valid && (
          <button
            type="button"
            onClick={onImport}
            disabled={hasInvalidSkip}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="sie4-import-btn"
          >
            Importera
          </button>
        )}
      </div>
      {hasInvalidSkip && (
        <p className="mt-2 text-right text-xs text-danger-600" role="alert">
          Kan inte importera med oanvänd-konflikt-skip. Ändra val ovan.
        </p>
      )}
    </div>
  )
}
