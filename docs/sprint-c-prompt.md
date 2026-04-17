# Sprint C — Feature-polish (~3 SP) [REVIDERAD EFTER QA-AUDIT]

**Datum:** TBD
**Tema:** Två små, orelaterade features som städar upp efter de större sprintarna.
Noll nya affärsinvarianter; enbart UX-förbättringar och kompletteringar av befintlig
backlog.

**Testbaslinje:** 2437 vitest, 58 Playwright-specs (53 pass + 9 pre-existing
bank/SIE4-failures ärvda från S56 UI/E2E-backlog — ej adresserade här).
PRAGMA 41.

**Revideringsnot:** Denna version integrerar fynd från QA-audit (pass 1 + 2).
Fix-punkter från auditen är markerade med `[QA-K#]`, `[QA-S#]`, `[QA-L#]`,
`[QA-T#]` inline där relevant.

---

## Bakgrund och motivation

### F62-d (2 SP) — Asset-redigering

F62 i Sprint 53 levererade skapa + lista + visa + avskriv + avyttra + radera för
anläggningstillgångar. Redigering har legat kvar i backlog sedan dess.

**Vanligt användningscase:** Användaren skriver fel namn, anskaffningskostnad eller
nyttjandeperiod vid skapandet, upptäcker det innan någon avskrivning körts, vill
korrigera. Idag måste tillgången raderas (`deleteFixedAsset` — tillåts endast vid
`schedules_executed === 0`) och återskapas från början. Omständligt.

**Scope-begränsning:** Redigering tillåts **endast** när tillgången är orörd —
status='active' OCH noll exekverade avskrivningar. När avskrivningar redan bokförts
blir redigering av anskaffningskostnad / nyttjandeperiod inkonsekvent med bokförda
verifikat (E-serien, M151, immutable via triggers M154). Korrekt arkitektonisk
respons: använd korrigeringsverifikat (C-serie via `correction-service`) — inte
edit. Samma mönster som `deleteFixedAsset` redan har.

### B1 (1 SP) — URL-state för pagination

Sprint 57 (C2a) införde `Pagination`-komponenten med state i förälder-komponenten
(`const [page, setPage] = useState(0)` i `InvoiceList` och `ExpenseList`). Nackdel:
navigera bort + tillbaka återställer till sida 0. F5 gör samma. Användaren tappar
sin scroll-position när de ska redigera något på sida 3 av fakturalistan.

**Lösning:** synkronisera `page`-state till URL:ens query-string (`?page=N`). Redan
befintliga helpers `getHashParams()` / `setHashParams()` i
[src/renderer/lib/router.tsx](src/renderer/lib/router.tsx) ger infrastrukturen.
Ingen router-förändring behövs.

---

## Deliverable A — F62-d Asset-redigering (2 SP)

### A.1 Service-lager: `updateFixedAsset`

**Fil:** [src/main/services/depreciation-service.ts](src/main/services/depreciation-service.ts)

**Funktionssignatur:**
```ts
export function updateFixedAsset(
  db: Database.Database,
  id: number,
  input: UpdateFixedAssetInput,
): IpcResult<{ scheduleCount: number }>
```

`UpdateFixedAssetInput` deklareras som **typalias** (inte ny strukturell typ) för
att förhindra framtida drift **[QA-S4]**:

```ts
// src/shared/types.ts
export type UpdateFixedAssetInput = CreateFixedAssetInput
```

`CreateFixedAssetInput` har redan inget `company_id` (hämtas server-side via
`SELECT id FROM companies LIMIT 1`). Ingen ytterligare typ-massaging behövs.

**Semantik (kritisk — reviderad ordning per [QA-K1]):**

**HELA validerings- och guard-logiken körs inuti `db.transaction()`** för att
eliminera race-condition mot `executeDepreciationPeriod`. Tidigare skisserad
flow där guarden kördes utanför transaktionen är FEL.

```ts
export function updateFixedAsset(db, id, input): IpcResult<{ scheduleCount: number }> {
  // Input-validering (rena värde-checks — ingen DB) körs utanför transaktion
  const inputError = validateFixedAssetInput(input, db)
  if (inputError) return inputError

  return db.transaction(() => {
    // 1. Ladda befintlig asset
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(id) as FixedAsset | undefined
    if (!asset) {
      return { success: false as const, code: 'NOT_FOUND' as const, error: 'Anläggningstillgång hittades inte' }
    }

    // 2. Pristine-guard — status
    if (asset.status !== 'active') {
      return { success: false as const, code: 'VALIDATION_ERROR' as const,
        error: 'Endast aktiva tillgångar kan redigeras' }
    }

    // 3. Pristine-guard — executed OR skipped schedules [QA-S7']
    // Skipped kan uppstå via partial-success-mönster i executeDepreciationPeriod
    // när en enskild schedule-rad failar. Båda tillstånd representerar historik
    // som inte får rensas.
    const nonPendingCount = (db.prepare(
      `SELECT COUNT(*) as n FROM depreciation_schedules
       WHERE fixed_asset_id = ? AND status IN ('executed', 'skipped')`
    ).get(id) as { n: number }).n
    if (nonPendingCount > 0) {
      return { success: false as const, code: 'HAS_EXECUTED_SCHEDULES' as const,
        error: `Kan inte redigera tillgång med historik (${nonPendingCount} bokförda eller överhoppade rader). Avyttra eller radera och återskapa om attributen behöver ändras.` }
    }

    // 4. Account-validering (inuti transaction för konsistens)
    // Optimering: skip validateAccountsActive för oförändrade konton [QA-K2']
    const changedAccounts: string[] = []
    if (input.account_asset !== asset.account_asset) changedAccounts.push(input.account_asset)
    if (input.account_accumulated_depreciation !== asset.account_accumulated_depreciation)
      changedAccounts.push(input.account_accumulated_depreciation)
    if (input.account_depreciation_expense !== asset.account_depreciation_expense)
      changedAccounts.push(input.account_depreciation_expense)

    if (changedAccounts.length > 0) {
      // Validera nyligen satta konton (finns + aktiva)
      const accountError = validateAccountChange(db, changedAccounts)
      if (accountError) return accountError
    }

    // 5. Radera pending schedules (alla eftersom pristine-guard har passerat)
    db.prepare('DELETE FROM depreciation_schedules WHERE fixed_asset_id = ?').run(id)

    // 6. UPDATE fixed_assets — explicit kolumnlista, INTE created_at [QA-K3']
    db.prepare(`
      UPDATE fixed_assets SET
        name = ?, acquisition_date = ?, acquisition_cost_ore = ?,
        residual_value_ore = ?, useful_life_months = ?, method = ?,
        declining_rate_bp = ?, account_asset = ?,
        account_accumulated_depreciation = ?, account_depreciation_expense = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.name,
      input.acquisition_date,
      input.acquisition_cost_ore,
      input.residual_value_ore,
      input.useful_life_months,
      input.method,
      input.declining_rate_bp ?? null,
      input.account_asset,
      input.account_accumulated_depreciation,
      input.account_depreciation_expense,
      todayLocalFromNow(),
      id,
    )

    // 7. Regenerera schedules via befintlig insertSchedule-helper (rad 172)
    const scheduleCount = insertSchedule(db, id, input)
    return { success: true as const, data: { scheduleCount } }
  })()
}
```

**Edge-case:** Om ny `acquisition_date` flyttar första period före ett stängt FY
(M142 chronology) — triggern `trg_check_period_on_booking` triggar inte här (vi
rör inte `journal_entries`), men framtida `executeDepreciationPeriod` kan misslyckas.
Accepterat: samma beteende som create med felaktigt datum; användaren ser felet vid
`executeDepreciationPeriod`-anropet.

**UX-flyktväg vid inaktivt konto [QA-K2']:** Pristine-guard filtrerar bort scenariot
där användaren har BOKFÖRDA avskrivningar. För aktivt asset utan avskrivningar:
- Om oförändrat konto är inaktivt — `validateAccountChange` anropas inte för detta konto
  → ingen `INACTIVE_ACCOUNT`-fel → edit går igenom
- Om användaren **byter** konto men det nya är inaktivt — `INACTIVE_ACCOUNT` returneras,
  UI:t visar felet på konto-fältet (som ju i edit-mode inte är disabled — se A.4)
- Om **ALLA tre** ursprungskonton är inaktiva utan byte → edit tillåts trots detta.
  Medvetet val: vi blockerar bara nya byten, inte bevarande av tidigare giltiga val.

**M100-kontrakt:** service kastar aldrig plain `Error`; returnerar strukturerade
`{ success, code, error, field? }`.

### A.2 IPC + Zod

**Fil:** [src/main/ipc-handlers.ts](src/main/ipc-handlers.ts)

```ts
ipcMain.handle('depreciation:update-asset', wrapIpcHandler(
  DepreciationUpdateAssetSchema,
  (data) => updateFixedAsset(getDb(), data.id, data.input),
))
```

**Zod-schema** i **`src/shared/ipc-schemas.ts`** (INTE `src/main/ipc/ipc-schemas.ts`
som tidigare angivits — fil saknas där) **[QA-K2]** — identiskt med
`DepreciationCreateAssetSchema` men wrappad i `{ id: number, input: {...} }`:

```ts
export const DepreciationUpdateAssetSchema = z.object({
  id: z.number().int().positive(),
  input: DepreciationCreateAssetSchema,
}).strict()
```

**Preload** (src/main/preload.ts): lägg till `updateFixedAsset` efter
`createFixedAsset`:

```ts
updateFixedAsset: (data: { id: number; input: CreateFixedAssetInput }) =>
  ipcRenderer.invoke('depreciation:update-asset', data),
```

**ErrorCode-utökning** (src/shared/types.ts): lägg till
`'HAS_EXECUTED_SCHEDULES'` i `ErrorCode`-unionen. Current union är ~56 medlemmar,
exhaustive-check i error-helpers.ts bör verifieras manuellt.

### A.3 Renderer-hook

**Fil:** [src/renderer/lib/hooks.ts](src/renderer/lib/hooks.ts)

```ts
export function useUpdateFixedAsset() {
  return useIpcMutation<
    { id: number; input: CreateFixedAssetInput },
    { scheduleCount: number }
  >((data) => window.api.updateFixedAsset(data), {
    // invalidateAll behålls för konsistens med useCreateFixedAsset — mer
    // precis invalidation (['fixed-assets'], ['fixed-asset', id]) är F-item
    // backlog om över-invalidation visar mätbar kostnad [QA-L9']
    invalidateAll: true,
  })
}
```

### A.4 UI-lager: reuse dialog via mode-prop

**Design-beslut:** döp om `CreateFixedAssetDialog` →
`FixedAssetFormDialog`, lägg till `mode: 'create' | 'edit'` + optional
`initialAsset?: FixedAssetWithAccumulation`-prop. Alternativet (ny `EditFixedAssetDialog` som
duplicerar form-markup) är värre — 150 rader duplicerad JSX, inline validering
dupliceras, framtida form-ändringar måste göras på två ställen.

**Fil:** [src/renderer/components/fixed-assets/CreateFixedAssetDialog.tsx](src/renderer/components/fixed-assets/CreateFixedAssetDialog.tsx)
→ byt namn till `FixedAssetFormDialog.tsx`.

**Ändringar:**

```ts
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialAsset?: FixedAssetWithAccumulation  // required when mode='edit'
}
```

- **useState-initialvärden** med lazy-initializer per fält (körs endast vid mount):

```ts
const [name, setName] = useState(() =>
  mode === 'edit' && initialAsset ? initialAsset.name : ''
)
const [acquisitionDate, setAcquisitionDate] = useState(() =>
  mode === 'edit' && initialAsset
    ? initialAsset.acquisition_date
    : new Date().toISOString().slice(0, 10)
)
// Monetary: .toFixed(2) för konsistent display [QA-S6']
const [costKr, setCostKr] = useState(() =>
  mode === 'edit' && initialAsset
    ? (initialAsset.acquisition_cost_ore / 100).toFixed(2)
    : ''
)
const [residualKr, setResidualKr] = useState(() =>
  mode === 'edit' && initialAsset
    ? (initialAsset.residual_value_ore / 100).toFixed(2)
    : '0'
)
const [months, setMonths] = useState(() =>
  mode === 'edit' && initialAsset ? String(initialAsset.useful_life_months) : '36'
)
const [method, setMethod] = useState<DepreciationMethod>(() =>
  mode === 'edit' && initialAsset ? initialAsset.method : 'linear'
)
// Declining rate: bevara ursprungsvärde vid linear→declining→linear flip [QA-S5']
const [decliningRatePct, setDecliningRatePct] = useState(() =>
  mode === 'edit' && initialAsset?.declining_rate_bp
    ? String(initialAsset.declining_rate_bp / 100)
    : '30'
)
const [assetAccount, setAssetAccount] = useState(() =>
  mode === 'edit' && initialAsset ? initialAsset.account_asset : '1220'
)
const [accAccount, setAccAccount] = useState(() =>
  mode === 'edit' && initialAsset ? initialAsset.account_accumulated_depreciation : '1229'
)
const [expAccount, setExpAccount] = useState(() =>
  mode === 'edit' && initialAsset ? initialAsset.account_depreciation_expense : '7832'
)
```

- **`resetForm` i edit-mode [QA-S3]:**
  - Efter successful submit: anropa ENDAST `onOpenChange(false)` — ingen
    `resetForm()`. Dialogen unmountas direkt (`if (!open) return null`),
    vilket redan rensar all state.
  - I create-mode behålls `resetForm()` + `onOpenChange(false)` som idag.

```ts
try {
  const r = mode === 'edit'
    ? await updateMutation.mutateAsync({ id: initialAsset!.id, input: payload })
    : await createMutation.mutateAsync(payload)
  toast.success(
    mode === 'edit'
      ? `Tillgång uppdaterad — ${r.scheduleCount} schema-rader regenererade`
      : `Tillgång skapad — ${r.scheduleCount} schema-rader genererade`
  )
  if (mode === 'create') resetForm()
  onOpenChange(false)
} catch (err) {
  setFormError(err instanceof Error ? err.message : 'Kunde inte spara tillgång')
}
```

- **Konto-fält i edit-mode [QA-S1]:** Konto-fält är **INTE** disabled i edit-mode.
  Specen ursprungligen sa "disabled för klarhet", men det skapar UX-deadlock vid
  inaktivt konto (se A.1 [QA-K2']). Istället:
  - Konto-fälten är editable i både create och edit
  - `handleAssetAccountChange` auto-populerar acc/exp-konton **endast** när
    `mode === 'create'` (annars överskriver det initialAsset-värden). I edit-mode
    används `setAssetAccount(e.target.value)` direkt utan auto-populate.
  - Hjälptext under fältet (edit-mode): "Att byta BAS-konto rekommenderas bara
    om ursprungligt konto blivit inaktivt."

```ts
function handleAssetAccountChange(value: string) {
  setAssetAccount(value)
  if (mode === 'create') {
    const defaults = findDepreciationDefaults(value)
    if (defaults) {
      setAccAccount(defaults.accumulated)
      setExpAccount(defaults.expense)
    }
  }
}
```

- **Titel:** "Ny anläggningstillgång" (create) / "Redigera {initialAsset.name}" (edit).
- **Submit-knapp-text:** "Skapa tillgång" / "Spara ändringar".

**Fil:** [src/renderer/pages/PageFixedAssets.tsx](src/renderer/pages/PageFixedAssets.tsx)

**Import [QA-L1]:**
```ts
import { ChevronDown, ChevronRight, Pencil, Plus, Play, Trash2, XCircle } from 'lucide-react'
```

Edit-knappen renderas i ordning **Redigera | Avyttra | Radera** (inte
"mellan Avyttra och Radera" som ursprungligen angavs — UX-konvention:
minst destruktiv först) **[QA-L4]**:

```tsx
{a.status === 'active' && a.schedules_executed === 0 && (
  <button
    type="button"
    onClick={() => setEditingAsset(a)}
    aria-label={`Redigera ${a.name}`}
    title="Redigera"
    data-testid={`fa-edit-${a.id}`}
    className="mr-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
  >
    <Pencil className="h-3.5 w-3.5" />
  </button>
)}
{a.status === 'active' && (
  /* Befintlig dispose-knapp oförändrad */
)}
{a.status === 'active' && a.schedules_executed === 0 && (
  /* Befintlig delete-knapp oförändrad */
)}
```

State:
```tsx
const [editingAsset, setEditingAsset] = useState<FixedAssetWithAccumulation | null>(null)
```

Render dialog med `mode` baserat på state:
```tsx
<FixedAssetFormDialog
  open={showCreate || editingAsset !== null}
  onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditingAsset(null) } }}
  mode={editingAsset ? 'edit' : 'create'}
  initialAsset={editingAsset ?? undefined}
/>
```

**Uppdatera [tests/e2e/README.md](tests/e2e/README.md)** whitelist med
`fa-edit-{id}` + form-field-testids som E2E interagerar med
(`fa-name`, `fa-cost`, `fa-submit`) **[QA-L5]**. Även
dialog-container testid `fixed-asset-form-dialog` bör läggas till för
robust dialog-detektering i E2E.

### A.5 Validerings-refaktor [HÅRT KRAV, inte längre "bonus"]

`createFixedAsset` har inline validering (rad 93–107). Extrahera till:

```ts
// Rena värde-checks (inget DB-beroende)
function validateFixedAssetInput(
  input: CreateFixedAssetInput,
  db: Database.Database,
): IpcResult<never> | null {
  if (input.acquisition_cost_ore < 0)
    return { success: false, code: 'VALIDATION_ERROR', error: '...', field: 'acquisition_cost_ore' }
  // ... (flytta rad 93–107 hit)

  // Konto-existens + aktiv-check (DB-beroende men ren validering)
  const accountFields = [...]
  // ... (flytta rad 109–133 hit)

  return null
}

// Optimerad variant för edit: bara oförändrade konton behöver inte valideras
function validateAccountChange(
  db: Database.Database,
  accounts: string[],
): IpcResult<never> | null {
  for (const value of accounts) {
    const exists = db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(value)
    if (!exists) return { success: false, code: 'ACCOUNT_NOT_FOUND', error: `Konto ${value} finns inte` }
  }
  try {
    validateAccountsActive(db, accounts)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    return { success: false, code: 'VALIDATION_ERROR', error: 'Kontot kunde inte valideras' }
  }
  return null
}
```

`createFixedAsset` använder `validateFixedAssetInput`; `updateFixedAsset`
använder `validateFixedAssetInput` (för värde-checks) + `validateAccountChange`
(bara för ändrade konton).

### A.6 Tester

**System-lager** (tests/session-C-depreciation-update.test.ts, ny fil):

```
describe('updateFixedAsset', () => {
  it('happy path: ändra name + cost på pristine asset → schedule regenereras')
  it('ändrar useful_life_months 36 → 24 → ny schedule har 24 rader')
  it('residual_value > cost → VALIDATION_ERROR, gamla schedule bevaras')
  it('NOT_FOUND om id inte existerar')

  // [QA-L3] Matcha felmeddelande via substring/regex, inte exakt string
  it('HAS_EXECUTED_SCHEDULES om avskrivning körd', () => {
    // [QA-T1'] Använd real executeDepreciationPeriod, INTE manuell INSERT
    const created = createFixedAsset(...)
    executeDepreciationPeriod(db, { fiscal_year_id: fyId, period_end_date: '...' })
    const result = updateFixedAsset(db, created.data.id, {...})
    expect(result.success).toBe(false)
    expect(result.code).toBe('HAS_EXECUTED_SCHEDULES')
    expect(result.error).toMatch(/Kan inte redigera tillgång med historik/)
  })

  it('VALIDATION_ERROR om asset.status = disposed')
  it('VALIDATION_ERROR om asset.status = fully_depreciated')
  it('method linear → declining → ny schedule respekterar rate_bp')
  it('saknat declining_rate_bp med method=declining → VALIDATION_ERROR')
  it('okänt konto → ACCOUNT_NOT_FOUND med rätt field (endast på ändrat konto)')
  it('inaktivt konto — oförändrat → SUCCESS (skip validation per [QA-K2'])')
  it('inaktivt konto — ändrat → INACTIVE_ACCOUNT')

  // [QA-T2'] Nytt test för id-preservation
  it('update preserverar asset.id (UPDATE inte DELETE+INSERT)', () => {
    const created = createFixedAsset(...)
    const originalId = created.data.id
    updateFixedAsset(db, originalId, {...})
    const after = getFixedAsset(db, originalId)
    expect(after.success).toBe(true)
    expect(after.data.id).toBe(originalId)
  })

  // Defense-in-depth: även om pristine-guard skulle fallera
  it('executed schedule-rader rörs ALDRIG vid race (pristine-guard inne i transaction)')

  // [QA-K3'] Nytt test för UPDATE-kolumnsemantik
  it('UPDATE rör inte created_at, uppdaterar updated_at', () => {
    const created = createFixedAsset(...)
    const before = db.prepare('SELECT created_at, updated_at FROM fixed_assets WHERE id = ?').get(created.data.id)
    // Wait 1 sek för att säkerställa timestamp-skillnad (eller använd FRITT_NOW)
    updateFixedAsset(db, created.data.id, {...})
    const after = db.prepare('SELECT created_at, updated_at FROM fixed_assets WHERE id = ?').get(created.data.id)
    expect(after.created_at).toBe(before.created_at)
    expect(after.updated_at).not.toBe(before.updated_at)
  })

  // [QA-S7'] Skipped-schedule-blockering
  it('HAS_EXECUTED_SCHEDULES om någon schedule har status=skipped')
})
```

**Renderer** (tests/renderer/components/fixed-assets/FixedAssetFormDialog.test.tsx):
```
describe('FixedAssetFormDialog (edit mode)', () => {
  it('pre-populerar fält från initialAsset med .toFixed(2)-format för belopp')
  it('axe-check passes (edit mode)') // M133 — inga disabled-fält som kräver aria
  it('konto-fält är EDITABLE i edit-läge (inte disabled) — [QA-S1/QA-K2]')
  it('handleAssetAccountChange auto-populerar INTE i edit-mode')
  it('bevarar declining_rate_bp vid method-flip linear→declining→linear')
  it('submit anropar useUpdateFixedAsset med rätt payload')
  it('HAS_EXECUTED_SCHEDULES-fel visar specifikt meddelande')
  it('titel är "Redigera {name}" i edit-mode')
  it('submit-knapp-text är "Spara ändringar" i edit-mode')
})

describe('FixedAssetFormDialog (create mode) — regression', () => {
  // Verifiera att create-mode beteende bevaras efter rename
  it('existerande create-flow passerar oförändrat')
  it('axe-check passes (create mode)')
})
```

**E2E** (tests/e2e/depreciation-update.spec.ts, ny) — **med `test.describe.serial()`** **[QA-S2]**:

```ts
test.describe.serial('depreciation-update', () => {
  // T1 skapar en pristine asset, T2 förutsätter att T1 körts + exekverar
  test('T1 — Redigera namn + cost på orörd asset → lista uppdateras', ...)
  test('T2 — Asset med exekverad avskrivning saknar edit-knapp i DOM', async ({ page }) => {
    // Skapa ny asset (unikt namn för att undvika [QA-L6']-konflikt)
    const assetId = await createAsset(page, { name: `E2E-Edit-Block-${Date.now()}` })
    await executePeriod(page, ...)
    await page.reload()
    await expect(page.getByTestId(`fa-edit-${assetId}`)).toHaveCount(0)
    await expect(page.getByTestId(`fa-dispose-${assetId}`)).toBeVisible()
  })
})
```

**Test-delta estimat:** +15–18 system-tester, +9 renderer-tester, +2 E2E.
Totalt ~+25 vitest, +1 Playwright-spec.

---

## Deliverable B — URL-state för pagination (1 SP)

### B.1 Ny hook: `usePageParam`

**Fil:** ny, [src/renderer/lib/use-page-param.ts](src/renderer/lib/use-page-param.ts)

Ingen JSDoc-blockkommentar **[QA-L2]** — hook-namn + signatur räcker, och
project-konventionen (CLAUDE.md) säger "default to writing no comments".

```ts
import { useCallback, useEffect, useState } from 'react'
import { getHashParams, setHashParams } from './router'

export function usePageParam(
  key: string,
  defaultPage = 0,
): [number, (page: number) => void] {
  const [page, setPageState] = useState(() => {
    const raw = getHashParams().get(key)
    const parsed = raw ? parseInt(raw, 10) : defaultPage
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultPage
  })

  useEffect(() => {
    function onHashChange() {
      const raw = getHashParams().get(key)
      const parsed = raw ? parseInt(raw, 10) : defaultPage
      setPageState(Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultPage)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [key, defaultPage])

  const setPage = useCallback(
    (p: number) => {
      setPageState(p)
      const params = getHashParams()
      if (p === defaultPage) {
        params.delete(key)
      } else {
        params.set(key, String(p))
      }
      const entries: Record<string, string> = {}
      params.forEach((v, k) => {
        entries[k] = v
      })
      setHashParams(entries)
    },
    [key, defaultPage],
  )

  return [page, setPage]
}
```

**Design-val:**

- **replaceState (via setHashParams)**, inte pushState.
- **Page 0 rensar query-param** — håller URL:en kort (`#/invoices` istället
  av `#/invoices?page=0`).
- **Graceful fallback på ogiltig input** — `?page=abc`, `?page=-1`, `?page=1.5`
  (parseInt→1) alla hanteras. Explicit testfall för fractional **[QA-L8']**.
- **hashchange-lyssnare** behövs för korrekt beteende vid Link-navigering om
  någon annan del av koden sätter params på samma sida.
- **Andra query-params bevaras** — `params.forEach` + rewrite.

### B.2 Adoption i InvoiceList

**Fil:** [src/renderer/components/invoices/InvoiceList.tsx](src/renderer/components/invoices/InvoiceList.tsx)

Ändring på rad 87: `const [page, setPage] = useState(0)` →
`const [page, setPage] = usePageParam('invoices_page', 0)`.

Rad 96, 102 (där `setPage(0)` anropas vid filter/search-ändring): **behåll
som-är** — hookens `setPage(0)` spelar bra med setState-anrop.

### B.3 Adoption i ExpenseList

**Fil:** [src/renderer/components/expenses/ExpenseList.tsx](src/renderer/components/expenses/ExpenseList.tsx)

Samma ändring: `usePageParam('expenses_page', 0)` på rad 79.

### B.4 Namespace-konvention

URL-key ska vara `{list}_page`-format (t.ex. `invoices_page`, `expenses_page`)
för att stödja framtida multi-list-sidor utan kollision.

**INTE `page`** (generisk) eftersom det kolliderar om en annan komponent
(t.ex. en framtida second-list på dashboard) också vill URL-synka.

### B.5 Tester

**Ren-funktion** (tests/renderer/lib/use-page-param.test.ts):
```
describe('usePageParam', () => {
  it('initial state från URL query-param')
  it('default när URL saknar param')
  it('ogiltig param (NaN, negativ) → default')
  it('fractional param (?page=1.5) → heltalsdel via parseInt') // [QA-L8']
  it('setPage uppdaterar URL via replaceState')
  it('page=0 tar bort param från URL')
  it('andra query-params bevaras när page ändras')

  // [QA-L7'] Explicit hashchange-test med dispatchEvent-trigger
  it('hashchange från extern källa synkar state', () => {
    const { result } = renderHook(() => usePageParam('invoices_page'))
    act(() => {
      window.location.hash = '#/invoices?invoices_page=5'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current[0]).toBe(5)
  })

  it('isolation mellan två hooks med olika keys')
})
```

**Integration** (tests/renderer/components/invoices/InvoiceList.test.tsx):
Utöka med ett test: ladda komponent med `?invoices_page=2` i hash → Pagination
visar sida 3 och IPC-anrop görs med rätt offset.

**E2E [QA-T3']:** två scenarier —
1. Navigera direkt till `#/invoices?invoices_page=2`, verifiera
   `pag-invoices-position` visar "Sida 3 / N".
2. **page.goBack()-test:** navigera till page 2 via UI → klicka Link till
   `/expenses` → `page.goBack()` → verifiera sida 2 återställs.

```ts
test('URL-state bevaras via browser back-button', async ({ page }) => {
  await page.goto('#/invoices')
  await page.getByTestId('pag-invoices-next').click()
  await page.getByTestId('pag-invoices-next').click()
  await expect(page.getByTestId('pag-invoices-position')).toHaveText(/Sida 3/)

  await page.click('a[href="#/expenses"]')
  await expect(page.getByTestId('page-expenses')).toBeVisible()

  await page.goBack()
  await expect(page.getByTestId('page-invoices')).toBeVisible()
  await expect(page.getByTestId('pag-invoices-position')).toHaveText(/Sida 3/)
})
```

**Test-delta:** ~+9 ren-funktion + 1 integration + 2 E2E.

### B.6 Out-of-scope (flaggas som framtida F-items)

- **Filter-state** (statusFilter i InvoiceList). Också en kandidat för URL-state
  men annat koncept — filter byter lista-subset, pagination scrollar inom.
- **Sort-state.** Sortering finns inte ännu; när det införs, lägg i URL samtidigt.
- **Bulk-selection-state.** Inte URL-relevant (per M112 bevaras över page-byte
  via in-memory `Set`, inte URL).
- **Precise React Query invalidation keys** för `useUpdateFixedAsset` (nu
  `invalidateAll: true`). F-item om prestanda-profiling visar mätbar
  kostnad **[QA-L9']**.
- **F62-e (edit av exekverad tillgång via korrigeringsverifikat).**

---

## Ordning och beroenden

A och B är **helt oberoende**.

**Rekommenderad körordning:**

1. **B** (URL-pagination) först — mindre, snabbare feedback-loop, isolerad
   infrastruktur.
2. **A** (asset-edit) — större, flera lager.

**Inom A:**
- A.5 (validerings-refaktor) **först** — nu hårt krav för att A.1 ska kunna
  återanvända `validateFixedAssetInput` och `validateAccountChange`.
- A.1 service + A.6 system-tester i samma commit (test-first är OK: skriv
  system-tester först, se dem failas rött, implementera service).
- A.2 IPC + A.3 hook i en commit.
- A.4 UI (inkl. rename av dialog) + A.6 renderer-tester i en commit.
- A.6 E2E sist.

---

## Exit-criteria (DoD)

- [ ] `npm run check:m133` / `check:m133-ast` / `check:m153` gröna (oförändrat)
- [ ] `tsc --noEmit` → 0 errors
- [ ] `npm test` → alla vitest gröna (nya tester inkluderade, test-count
      ökat med ~35)
- [ ] `npm run test:e2e -- depreciation-execute.spec.ts depreciation-update.spec.ts`
      → alla gröna. Full suite fortsatt samma 9 pre-existing failures.
- [ ] **ABI-invariant intakt:** `scripts/run-e2e.mjs` oförändrat, smoketest ingår.
- [ ] Nya `data-testid` i whitelist ([tests/e2e/README.md](tests/e2e/README.md)):
      `fa-edit-{id}`, `fa-name`, `fa-cost`, `fa-submit`, `fixed-asset-form-dialog`.
- [ ] `CreateFixedAssetDialog` omdöpt till `FixedAssetFormDialog`; alla imports
      uppdaterade (via sök-och-ersätt + TSC-verification).
- [ ] URL med `?invoices_page=2` visar sida 3 efter page-reload (manuell
      verifiering i dev-app).
- [ ] **Browser back-button bevarar pagination-state** (E2E-verifierat).
- [ ] **Ingen ny M-princip krävs.**

---

## Vad som INTE ingår

- **F62-e (edit av exekverad tillgång via korrigeringsverifikat)**
- **Filter-state i URL** (statusFilter)
- **Sort-state i URL**
- **Bank/SIE4 E2E-failures från S56-backlog**
- **Schedule-regeneration för executed assets**

---

## Kända risker

**R1 — Rename av `CreateFixedAssetDialog` → `FixedAssetFormDialog`.**
Breaking för alla imports. Sök-och-ersätt + TSC fångar det. Verifiera att
ingen test-fil refererar den via strängmatchning.

**R2 — `invalidateAll: true` i `useUpdateFixedAsset`.**
Overkill men konsistent med befintliga mutations. F-item backlog [QA-L9'].

**R3 — Schedule delete + regenerate är atomär via `db.transaction()`.**
Med [QA-K1]-fixen (pristine-guard inuti transaktion) finns ingen race-risk.
Test negativt via monkey-patch av `insertSchedule` som kastar — rollback
verifieras.

**R4 — `usePageParam` med två hooks med samma key.**
Pilot-fel, inte bug. Test-case visar isolation.

**R5 — `replaceState` och webbläsar-scroll-state.**
hashchange triggas vid back/forward i Electron/Chromium. E2E [QA-T3']
verifierar.

**R6 — Edit-knapp-visibility matchar delete-knapp.**
`status === 'active' && schedules_executed === 0`. Om villkoren drivs isär
i framtiden (edit tillåts på `fully_depreciated` men delete inte), skapa
en konstant `CAN_EDIT_ASSET(asset)` när tredje användning dyker upp.

**R7 — UX-deadlock vid inaktivt konto. [QA-K2']**
Mitigerat via (a) skip validateAccountsActive för oförändrade konton,
(b) edit-mode har editable konto-fält (inte disabled).

**R8 — Skipped schedules på active asset. [QA-S7']**
Pristine-guard inkluderar nu `status IN ('executed', 'skipped')`, fångar
edge-caset att partial-success i `executeDepreciationPeriod` kan markera
rader som skipped utan att ändra asset-status.

---

## Infrastruktur-noteringar

- **IPC-handler via `wrapIpcHandler`** (M128 mönster 2).
- **M144 IpcResult-mandat** — `depreciation:update-asset` är affärsdata-kanal.
- **Form-schema i _kr-suffix (M136)** — edit-dialogen använder `.toFixed(2)`
  för initial render av belopp-fält [QA-S6'].
- **M100 strukturerade fel** — `HAS_EXECUTED_SCHEDULES` + `NOT_FOUND` +
  `VALIDATION_ERROR` returneras som `{ code, error, field? }`.
- **M121/M141 ej triggad** — inget table-recreate, bara UPDATE + DELETE/INSERT
  av schedule-rader.
- **FTS5 rebuildSearchIndex ej kallad** — `updateFixedAsset` skapar inte
  journal_entries, bara schedule-rader (som inte indexeras).

---

## Lärdomar som bakas in från tidigare sprintar

**Från Sprint B (M133/AST):** Om nya renderer-komponenter eller -tester skapas,
se till att `// M133 exempt`-kommentarer läggs till om `axeCheck: false`
används. Ingen disabled-UI-hack behövs nu i edit-mode [QA-K2'], så a11y
borde passa naturligt.

**Från Sprint B (F62-c E2E):** Seed-konton 3970/7970 behövs INTE för F62-d-
tester eftersom vi aldrig avyttrar i dessa testscenarier. Enbart
1220/1229/7832 (BAS-defaults som redan finns).

**Från Sprint A:** IPC-kontrakt M148 — all test-data seedas via `window.api` /
`window.__testApi`, aldrig direkt better-sqlite3 i testprocessen.

**Från QA-audit pass 1 + 2:** Pristine-guardar måste ligga **inuti**
transaktionen när DB-state kan ändras av konkurrerande operationer.
State-initialisering i form-komponenter ska vara explicit (lazy-initializers
per fält) snarare än via generiska reset-funktioner. UX-flyktvägar behövs
vid domän-regel-låsningar (inaktivt konto, immutable historik).
