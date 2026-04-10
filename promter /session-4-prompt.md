# Session 4: Layout + Navigation + Årsväljare + Periodstängning

## Kontext

Du arbetar i `~/fritt-bokforing/`, ett Electron + React + TypeScript-projekt.

**Vad som redan finns (session 1–3):**
- Electron + React 18 + TypeScript (strict) + Tailwind CSS + shadcn/ui
- SQLite via better-sqlite3 (WAL-läge), PRAGMA user_version = 4
- 13 tabeller, 9 triggers (8 session 2 + 1 session 3: trg_validate_org_number)
- ~104 BAS-konton (K2/K3-märkta) + 7 momskoder med SKV report_box
- Onboarding-wizard (3 steg) → skapar company + fiscal_year + 12 fiscal_periods
- IPC-mönster: `entity:action` + `IpcResult<T>` + `ErrorCode` + `field?`
- IPC-kanaler: `company:create`, `company:get`
- TanStack Query hooks: `useCompany()`, `useCreateCompany()`
- App.tsx routing: `if (!company) → <OnboardingWizard />` else `→ <AppShell />`
- AppShell.tsx = placeholder ("Välkommen till [namn]")
- 50 gröna tester, 0 lint errors
- `CLAUDE.md` med 13 arkitekturprinciper

**Läs innan du börjar:**
- `CLAUDE.md` — arkitekturprinciper (alla 13 gäller)
- `src/main/services/company-service.ts` — IPC-mönster att följa
- `src/main/ipc-handlers.ts` — nuvarande IPC-registrering
- `src/main/ipc-schemas.ts` — nuvarande Zod-scheman
- `src/main/preload.ts` — nuvarande contextBridge
- `src/shared/types.ts` — nuvarande delade typer (IpcResult, ErrorCode, Company, FiscalYear, FiscalPeriod)
- `src/renderer/App.tsx` — nuvarande wizard-vs-shell routing
- `src/renderer/pages/AppShell.tsx` — nuvarande placeholder (REFAKTORERAS)
- `src/renderer/pages/OnboardingWizard.tsx` — RÖRÖR INTE

---

## Mål

Bygg appens layout, sidebar-navigation och kontexthantering. Användaren ska kunna navigera mellan 7 sidor, välja räkenskapsår, se periodstatus och stänga/öppna perioder.

**Sessionen levererar:**
1. AppShell med sidebar (220px) + content area
2. 7 nav-items + 1 footer-item (Inställningar)
3. Årsväljare i sidebar (global kontext)
4. Månadsindikator i sidebar (12 rutor)
5. Periodlista på Översikt med stäng/öppna-funktionalitet
6. FiscalYearContext (React Context)
7. Read-only-läge för stängda år
8. PageHeader-komponent med action-slot
9. 4 nya IPC-kanaler
10. ~14 nya tester (totalt ~64)

**Sessionen levererar INTE:**
- Sub-navigation inom sidor (session 5 lägger till "+ Ny faktura" i PageHeader)
- Kollapserbar sidebar (session 20)
- Helstängning av räkenskapsår (session 26 bokslut)
- Riktiga data i metric cards (session 12 dashboard)
- Lönehantering (fas 2)
- Keyboard shortcuts (session 20)
- React Router (useState räcker, uppgradera i session 5 vid behov)

**VIKTIGT — Refaktorering:**
- `AppShell.tsx` REFAKTORERAS från placeholder till fullständig layout
- `App.tsx` routing (wizard vs app-shell) BEHÅLLS ORÖRD
- `OnboardingWizard.tsx` BEHÅLLS ORÖRD
- Alla andra session 3-filer BEHÅLLS

---

## Steg 1: Arkitekturprincip #14 i CLAUDE.md

Lägg till efter #13:

```
## 14. Alla data-queries scopas till aktivt fiscal_year_id
FiscalYearContext är global state. Alla IPC-kanaler som hämtar
transaktionsdata (fakturor, kostnader, journal_entries, moms) tar
fiscal_year_id som parameter. Anta aldrig "aktuellt år".
```

---

## Steg 2: Nya typer (src/shared/types.ts)

Lägg till (behåll alla befintliga typer):

```typescript
// === Page navigation ===
export type PageId =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'vat'
  | 'tax'
  | 'export'
  | 'settings';

// === Fiscal Year Context ===
export interface FiscalYearContextValue {
  activeFiscalYear: FiscalYear | null;
  setActiveFiscalYear: (fy: FiscalYear) => void;
  allFiscalYears: FiscalYear[];
  isReadOnly: boolean; // true om activeFiscalYear.is_closed === 1
}
```

Lägg till nya ErrorCodes i den befintliga `ErrorCode`-typen:

```typescript
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_ORG_NUMBER'
  | 'PERIOD_GENERATION_ERROR'
  | 'TRANSACTION_ERROR'
  | 'NOT_FOUND'
  | 'PERIOD_NOT_SEQUENTIAL'    // NY: försök stänga/öppna period i fel ordning
  | 'YEAR_IS_CLOSED';          // NY: försök stänga/öppna period i stängt år
```

---

## Steg 3: Fiscal service (src/main/services/fiscal-service.ts)

Ny fil. Följ EXAKT samma mönster som `company-service.ts`.

```typescript
import type { Database } from 'better-sqlite3';
import type { FiscalYear, FiscalPeriod, IpcResult } from '../../shared/types';

// === fiscal-year:list ===
export function listFiscalYears(db: Database): FiscalYear[] {
  const rows = db.prepare(
    'SELECT * FROM fiscal_years ORDER BY start_date DESC'
  ).all();
  return rows as FiscalYear[];
}

// === fiscal-period:list ===
export function listFiscalPeriods(
  db: Database,
  fiscalYearId: number
): FiscalPeriod[] {
  const rows = db.prepare(
    'SELECT * FROM fiscal_periods WHERE fiscal_year_id = ? ORDER BY period_number ASC'
  ).all(fiscalYearId);
  return rows as FiscalPeriod[];
}

// === fiscal-period:close ===
export function closePeriod(
  db: Database,
  periodId: number
): IpcResult<FiscalPeriod> {
  try {
    const period = db.prepare(
      'SELECT * FROM fiscal_periods WHERE id = ?'
    ).get(periodId) as FiscalPeriod | undefined;

    if (!period) {
      return { success: false, error: 'Perioden hittades inte.', code: 'NOT_FOUND' };
    }

    // Kontrollera att räkenskapsåret inte är stängt
    const fy = db.prepare(
      'SELECT * FROM fiscal_years WHERE id = ?'
    ).get(period.fiscal_year_id) as FiscalYear;

    if (fy.is_closed === 1) {
      return {
        success: false,
        error: 'Räkenskapsåret är stängt. Perioder kan inte ändras.',
        code: 'YEAR_IS_CLOSED',
      };
    }

    // Kontrollera sekventiell ordning: alla tidigare perioder måste vara stängda
    const openBefore = db.prepare(`
      SELECT COUNT(*) as count FROM fiscal_periods
      WHERE fiscal_year_id = ? AND period_number < ? AND is_closed = 0
    `).get(period.fiscal_year_id, period.period_number) as { count: number };

    if (openBefore.count > 0) {
      return {
        success: false,
        error: 'Du måste stänga tidigare månader först.',
        code: 'PERIOD_NOT_SEQUENTIAL',
      };
    }

    // Kontrollera att perioden inte redan är stängd
    if (period.is_closed === 1) {
      return {
        success: false,
        error: 'Perioden är redan stängd.',
        code: 'VALIDATION_ERROR',
      };
    }

    db.prepare('UPDATE fiscal_periods SET is_closed = 1 WHERE id = ?').run(periodId);

    const updated = db.prepare(
      'SELECT * FROM fiscal_periods WHERE id = ?'
    ).get(periodId) as FiscalPeriod;

    return { success: true, data: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel';
    return { success: false, error: message, code: 'TRANSACTION_ERROR' };
  }
}

// === fiscal-period:reopen ===
export function reopenPeriod(
  db: Database,
  periodId: number
): IpcResult<FiscalPeriod> {
  try {
    const period = db.prepare(
      'SELECT * FROM fiscal_periods WHERE id = ?'
    ).get(periodId) as FiscalPeriod | undefined;

    if (!period) {
      return { success: false, error: 'Perioden hittades inte.', code: 'NOT_FOUND' };
    }

    // Kontrollera att räkenskapsåret inte är stängt
    const fy = db.prepare(
      'SELECT * FROM fiscal_years WHERE id = ?'
    ).get(period.fiscal_year_id) as FiscalYear;

    if (fy.is_closed === 1) {
      return {
        success: false,
        error: 'Räkenskapsåret är stängt. Perioder kan inte ändras.',
        code: 'YEAR_IS_CLOSED',
      };
    }

    // Kontrollera att perioden är stängd
    if (period.is_closed === 0) {
      return {
        success: false,
        error: 'Perioden är redan öppen.',
        code: 'VALIDATION_ERROR',
      };
    }

    // Kontrollera sekventiell ordning: ingen SENARE period får vara stängd
    const closedAfter = db.prepare(`
      SELECT COUNT(*) as count FROM fiscal_periods
      WHERE fiscal_year_id = ? AND period_number > ? AND is_closed = 1
    `).get(period.fiscal_year_id, period.period_number) as { count: number };

    if (closedAfter.count > 0) {
      return {
        success: false,
        error: 'Du måste öppna senare månader först.',
        code: 'PERIOD_NOT_SEQUENTIAL',
      };
    }

    db.prepare('UPDATE fiscal_periods SET is_closed = 0 WHERE id = ?').run(periodId);

    const updated = db.prepare(
      'SELECT * FROM fiscal_periods WHERE id = ?'
    ).get(periodId) as FiscalPeriod;

    return { success: true, data: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel';
    return { success: false, error: message, code: 'TRANSACTION_ERROR' };
  }
}
```

---

## Steg 4: Zod-scheman (src/main/ipc-schemas.ts)

Lägg till:

```typescript
export const FiscalPeriodListInputSchema = z.object({
  fiscal_year_id: z.number().int().positive(),
});

export const PeriodActionInputSchema = z.object({
  period_id: z.number().int().positive(),
});
```

---

## Steg 5: IPC-handlers (src/main/ipc-handlers.ts)

Lägg till 4 nya kanaler. Följ `entity:action`-mönstret.

```typescript
import {
  listFiscalYears,
  listFiscalPeriods,
  closePeriod,
  reopenPeriod,
} from './services/fiscal-service';
import {
  FiscalPeriodListInputSchema,
  PeriodActionInputSchema,
} from './ipc-schemas';

// Lägg till i registerIpcHandlers:

ipcMain.handle('fiscal-year:list', () => {
  return listFiscalYears(db);
});

ipcMain.handle('fiscal-period:list', (_event, input: unknown) => {
  const parsed = FiscalPeriodListInputSchema.safeParse(input);
  if (!parsed.success) {
    return []; // tom lista vid ogiltigt input
  }
  return listFiscalPeriods(db, parsed.data.fiscal_year_id);
});

ipcMain.handle('fiscal-period:close', (_event, input: unknown) => {
  const parsed = PeriodActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Ogiltigt period-id.',
      code: 'VALIDATION_ERROR' as const,
    };
  }
  return closePeriod(db, parsed.data.period_id);
});

ipcMain.handle('fiscal-period:reopen', (_event, input: unknown) => {
  const parsed = PeriodActionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Ogiltigt period-id.',
      code: 'VALIDATION_ERROR' as const,
    };
  }
  return reopenPeriod(db, parsed.data.period_id);
});
```

---

## Steg 6: Preload (src/main/preload.ts)

Lägg till i befintligt api-objekt:

```typescript
listFiscalYears: () =>
  ipcRenderer.invoke('fiscal-year:list'),
listFiscalPeriods: (data: { fiscal_year_id: number }) =>
  ipcRenderer.invoke('fiscal-period:list', data),
closePeriod: (data: { period_id: number }) =>
  ipcRenderer.invoke('fiscal-period:close', data),
reopenPeriod: (data: { period_id: number }) =>
  ipcRenderer.invoke('fiscal-period:reopen', data),
```

---

## Steg 7: TanStack Query hooks (src/renderer/lib/hooks.ts)

Lägg till (behåll befintliga hooks: useCompany, useCreateCompany):

```typescript
import type {
  FiscalYear,
  FiscalPeriod,
  IpcResult,
} from '../../shared/types';

// === Fiscal Years ===
export function useFiscalYears() {
  return useQuery<FiscalYear[]>({
    queryKey: ['fiscal-years'],
    queryFn: () => window.api.listFiscalYears(),
  });
}

// === Fiscal Periods ===
export function useFiscalPeriods(fiscalYearId: number | undefined) {
  return useQuery<FiscalPeriod[]>({
    queryKey: ['fiscal-periods', fiscalYearId],
    queryFn: () => window.api.listFiscalPeriods({ fiscal_year_id: fiscalYearId! }),
    enabled: !!fiscalYearId,
  });
}

// === Close Period ===
export function useClosePeriod(fiscalYearId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation<IpcResult<FiscalPeriod>, Error, { period_id: number }>({
    mutationFn: (data) => window.api.closePeriod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods', fiscalYearId] });
    },
  });
}

// === Reopen Period ===
export function useReopenPeriod(fiscalYearId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation<IpcResult<FiscalPeriod>, Error, { period_id: number }>({
    mutationFn: (data) => window.api.reopenPeriod(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods', fiscalYearId] });
    },
  });
}
```

---

## Steg 8: FiscalYearContext (src/renderer/contexts/FiscalYearContext.tsx)

Ny fil. React Context som wrappas runt alla sidor.

**Persistence:** Valt år sparas via IPC så appen minns det vid omstart. Implementera genom att lägga till en enkel `settings`-IPC som sparar/hämtar `last_fiscal_year_id` via `electron-store` (npm-paket) eller en `app_settings`-tabell. Enklaste: använd `electron-store` i main process.

**Installera:** `npm install electron-store`

**Main process** — lägg till i `ipc-handlers.ts`:
```typescript
import Store from 'electron-store';
const store = new Store();

ipcMain.handle('settings:get', (_event, key: string) => {
  return store.get(key, null);
});

ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
  store.set(key, value);
});
```

**Preload** — lägg till:
```typescript
getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
```

**Context:**

```typescript
import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import type { FiscalYear, FiscalYearContextValue } from '../../shared/types';
import { useFiscalYears } from '../lib/hooks';

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

export function FiscalYearProvider({ children }: { children: React.ReactNode }) {
  const { data: allFiscalYears = [] } = useFiscalYears();
  const [selectedYear, setSelectedYear] = useState<FiscalYear | null>(null);
  const [restoredId, setRestoredId] = useState<number | null>(null);

  // Återställ senast valda år vid start
  useEffect(() => {
    window.api.getSetting('last_fiscal_year_id').then((id: unknown) => {
      if (typeof id === 'number') setRestoredId(id);
    });
  }, []);

  // Default: återställt år → nyaste öppna → nyaste stängda
  const activeFiscalYear = useMemo(() => {
    if (selectedYear) return selectedYear;
    if (restoredId) {
      const restored = allFiscalYears.find((fy) => fy.id === restoredId);
      if (restored) return restored;
    }
    const openYear = allFiscalYears.find((fy) => fy.is_closed === 0);
    return openYear ?? allFiscalYears[0] ?? null;
  }, [selectedYear, restoredId, allFiscalYears]);

  // Spara valt år vid byte
  const setActiveFiscalYear = (fy: FiscalYear) => {
    setSelectedYear(fy);
    window.api.setSetting('last_fiscal_year_id', fy.id);
  };

  const isReadOnly = activeFiscalYear?.is_closed === 1;

  // useMemo förhindrar onödiga re-renders
  const value = useMemo<FiscalYearContextValue>(
    () => ({
      activeFiscalYear,
      setActiveFiscalYear,
      allFiscalYears,
      isReadOnly,
    }),
    [activeFiscalYear, allFiscalYears, isReadOnly]
  );

  return (
    <FiscalYearContext.Provider value={value}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYearContext(): FiscalYearContextValue {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) {
    throw new Error('useFiscalYearContext måste användas inom FiscalYearProvider');
  }
  return ctx;
}
```

---

## Steg 9: AppShell REFAKTORERING (src/renderer/pages/AppShell.tsx)

**Byt ut hela innehållet** i AppShell.tsx. Behåll propsen `company: Company`.

Struktur:

```
<FiscalYearProvider>
  <div className="flex h-screen">
    <Sidebar company={company} activePage={page} onNavigate={setPage} />
    <main className="flex-1 flex flex-col overflow-hidden">
      {isReadOnly && <ReadOnlyBanner year={activeFiscalYear} />}
      <PageContent page={page} />
    </main>
  </div>
</FiscalYearProvider>
```

**Routing:** `useState<PageId>('overview')` med en `navigate` funktion.

**Electron window title:** `useEffect` som sätter `document.title`:
```typescript
useEffect(() => {
  document.title = `Fritt Bokföring — ${company.name}`;
}, [company.name]);
```

**PageContent** renderar rätt sida baserat på `page`:
- `overview` → `<PageOverview />`
- `income` → `<PageIncome />`
- `expenses` → `<PageExpenses />`
- `vat` → `<PageVat />`
- `tax` → `<PageTax />`
- `export` → `<PageExport />`
- `settings` → `<PageSettings />`

---

## Steg 10: Sidebar (src/renderer/components/layout/Sidebar.tsx)

Props: `company: Company`, `activePage: PageId`, `onNavigate: (page: PageId) => void`

Layout (top → bottom):
1. **Header** (border-bottom):
   - Företagsnamn: `company.name` (14px, font-medium)
   - Regel: `company.fiscal_rule === 'K2' ? 'Förenklad (K2)' : 'Fullständig (K3)'` (12px, muted)
   - `<YearPicker />`
   - `<MonthIndicator />`

2. **Nav** (flex-1, overflow-y: auto):
   - Sektionsrubrik: "Hantera" (11px, uppercase, tracking-wide, text-muted)
   - NavItem: Översikt (overview) — ikon: LayoutDashboard (lucide)
   - NavItem: Pengar in (income) — ikon: ArrowDownCircle
   - NavItem: Pengar ut (expenses) — ikon: ArrowUpCircle
   - Sektionsrubrik: "Rapporter"
   - NavItem: Moms (vat) — ikon: Receipt
   - NavItem: Skatt (tax) — ikon: Calculator
   - Sektionsrubrik: "Övrigt"
   - NavItem: Exportera (export) — ikon: Download

3. **Footer** (border-top, margin-top: auto):
   - NavItem: Inställningar (settings) — ikon: Settings

Bredd: `w-[220px]` fast. Bakgrund: `bg-muted/30` eller liknande Tailwind-neutral.

Använd lucide-react för ikoner (redan tillgängligt via shadcn/ui).

---

## Steg 11: NavItem (src/renderer/components/layout/NavItem.tsx)

Props: `icon: LucideIcon`, `label: string`, `isActive: boolean`, `onClick: () => void`

```tsx
<button
  onClick={onClick}
  className={cn(
    'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm',
    isActive
      ? 'bg-background font-medium text-foreground'
      : 'text-muted-foreground hover:bg-background/50'
  )}
>
  <Icon className="h-4 w-4" />
  {label}
</button>
```

---

## Steg 12: YearPicker (src/renderer/components/layout/YearPicker.tsx)

Använd `useFiscalYearContext()` för att hämta `allFiscalYears`, `activeFiscalYear`, `setActiveFiscalYear`.

**Visnig av år:**
- Kalenderår: `startYear` (t.ex. "2026")
- Brutet år: `startYear/slutÅr` (t.ex. "2026/27")
- Beräkna: jämför `start_date` och `end_date` — om de är i olika kalenderår, visa med snedstreck

```typescript
function formatFiscalYearLabel(fy: FiscalYear): string {
  const startYear = new Date(fy.start_date).getFullYear();
  const endYear = new Date(fy.end_date).getFullYear();
  if (startYear === endYear) return String(startYear);
  return `${startYear}/${String(endYear).slice(-2)}`;
}
```

**Stängt år:** Visa hänglåsikon (Lock från lucide-react) + orange/warning border.

Använd shadcn Select eller en enkel dropdown.

---

## Steg 13: MonthIndicator (src/renderer/components/layout/MonthIndicator.tsx)

Använd `useFiscalYearContext()` för `activeFiscalYear` och `useFiscalPeriods(activeFiscalYear?.id)`.

**12 rutor i 6×2 grid:**

```tsx
<div className="grid grid-cols-6 gap-1">
  {periods.map((period) => (
    <div
      key={period.id}
      className={cn(
        'aspect-square flex items-center justify-center text-[10px] font-medium rounded',
        period.is_closed === 1
          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
          : isFirstOpen(period)
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 ring-1 ring-blue-300'
            : 'bg-muted text-muted-foreground'
      )}
      title={getMonthName(period)}
    >
      {getMonthLetter(period)}
    </div>
  ))}
</div>
```

**KRITISKT — Månadsnamn från datum, inte period_number:**

```typescript
function getMonthLetter(period: FiscalPeriod): string {
  // Hämta månadsnamn från period.start_date, INTE från period_number
  // Brutet år (jul-jun): period 1 = "J" (juli), inte "J" (januari)
  return new Date(period.start_date)
    .toLocaleDateString('sv-SE', { month: 'short' })
    .charAt(0)
    .toUpperCase();
}

function getMonthName(period: FiscalPeriod): string {
  return new Date(period.start_date)
    .toLocaleDateString('sv-SE', { month: 'long' });
}

function isFirstOpen(period: FiscalPeriod, allPeriods: FiscalPeriod[]): boolean {
  // Första perioden med is_closed === 0
  const firstOpen = allPeriods.find((p) => p.is_closed === 0);
  return firstOpen?.id === period.id;
}
```

Liten legend under gridden: "Klar · Aktiv · Öppen" (text-xs, text-muted-foreground).

---

## Steg 14: PageHeader (src/renderer/components/layout/PageHeader.tsx)

Props: `title: string`, `action?: React.ReactNode`

```tsx
export function PageHeader({ title, action }: PageHeaderProps) {
  const { isReadOnly } = useFiscalYearContext();

  return (
    <div className="flex items-center justify-between px-8 py-5 border-b">
      <h1 className="text-lg font-medium">{title}</h1>
      {!isReadOnly && action}
    </div>
  );
}
```

Session 5 kommer använda: `<PageHeader title="Pengar in" action={<Button>+ Ny faktura</Button>} />`

---

## Steg 15: ReadOnlyBanner (src/renderer/components/layout/ReadOnlyBanner.tsx)

Visas BARA om `isReadOnly === true`. Gul/amber banner överst i content area.

```tsx
export function ReadOnlyBanner() {
  const { activeFiscalYear } = useFiscalYearContext();
  if (!activeFiscalYear) return null;

  const label = formatFiscalYearLabel(activeFiscalYear);

  return (
    <div className="px-8 py-2 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2 border-b border-amber-200 dark:border-amber-800">
      <span>⚠</span>
      Du tittar på räkenskapsåret {label} (stängt). Data kan inte ändras.
    </div>
  );
}
```

---

## Steg 16: Översikt-sidan (src/renderer/pages/PageOverview.tsx)

Två sektioner:

### 16a. Metric cards (2×2 grid)

Använd `<MetricCard />` komponent.

```tsx
<div className="grid grid-cols-2 gap-3 mb-8">
  <MetricCard label="Pengar in" value="0 kr" />
  <MetricCard label="Pengar ut" value="0 kr" />
  <MetricCard label="Moms att betala" value="0 kr" />
  <MetricCard label="Resultat" value="0 kr" />
</div>
```

Dessa är statiska i session 4. Session 12 kopplar in riktiga data.

### 16b. MetricCard (src/renderer/components/overview/MetricCard.tsx)

```tsx
export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-medium">{value}</p>
    </div>
  );
}
```

### 16c. PeriodList (src/renderer/components/overview/PeriodList.tsx)

Hämta perioder med `useFiscalPeriods(activeFiscalYear?.id)`.

Visa alla 12 perioder som en lista:

```
Månadsnamn | Status-badge | Action-knapp
```

**Månadsnamn:** Hämta från `period.start_date` med `toLocaleDateString('sv-SE', { month: 'long' })`. Första bokstaven versal.

**Status-badge:**
- Stängd: grön badge "Klar"
- Öppen: grå badge "Öppen"

**Action-knapp:**
- "Stäng [månad]" — visas BARA på den FÖRSTA öppna perioden (sekventiellt)
- "Öppna [månad]" — visas BARA på den SENAST stängda perioden
- Om året är stängt: inga knappar

**Bekräftelse-dialog (shadcn AlertDialog) för stängning:**
- Titel: "Stäng [månad]?"
- Beskrivning: "Inga nya transaktioner kan bokföras i [månad] efter detta. Du kan öppna månaden igen om det behövs."
- Knappar: "Avbryt" / "Stäng månaden"

**Ingen bekräftelse-dialog för öppna** — låg risk, inte permanent.

**Logik för att hitta nästa stängbara/öppningsbara:**

```typescript
const firstOpenIndex = periods.findIndex((p) => p.is_closed === 0);
const lastClosedIndex = periods.findLastIndex((p) => p.is_closed === 1);
// firstOpenIndex === perioden som kan stängas
// lastClosedIndex === perioden som kan öppnas
// firstOpenIndex === -1 → ALLA perioder stängda
```

**"Alla perioder stängda"-meddelande:**
Om `firstOpenIndex === -1` (alla 12 stängda) och året inte redan är stängt (`fiscal_years.is_closed === 0`), visa en informationsruta under periodlistan:

```tsx
{allClosed && !isYearClosed && (
  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-sm rounded-lg border border-blue-200 dark:border-blue-800">
    Alla månader för {yearLabel} är stängda. Du kan nu förbereda bokslut.
  </div>
)}
```

Bara information — ingen boksluts-logik (det är session 26).

---

## Steg 17: Placeholder-sidor

Skapa dessa som minimala komponenter:

- `PageIncome.tsx` → `<PageHeader title="Pengar in" />` + "Kommer i nästa uppdatering"
- `PageExpenses.tsx` → `<PageHeader title="Pengar ut" />` + placeholder
- `PageVat.tsx` → `<PageHeader title="Moms" />` + placeholder
- `PageTax.tsx` → `<PageHeader title="Skatt" />` + placeholder
- `PageExport.tsx` → `<PageHeader title="Exportera" />` + placeholder
- `PageSettings.tsx` → `<PageHeader title="Inställningar" />` + placeholder

Alla visar centrerad text: `<p className="text-center text-muted-foreground mt-16">Kommer i nästa uppdatering</p>`

---

## Steg 18: Tester (~14 st)

Skriv i `tests/session-4.test.ts` (eller dela upp).

### 18a. IPC (4 tester)

```
test 1: fiscal-year:list returnerar 1 år efter onboarding

test 2: fiscal-period:list returnerar 12 perioder för ett år, sorterade period_number ASC

test 3: fiscal-period:close stänger period 1 (is_closed → 1)

test 4: fiscal-period:close avvisar osekventiell stängning
  - Alla perioder öppna → försök stänga period 3 → error PERIOD_NOT_SEQUENTIAL
```

### 18b. Periodstängningslogik (4 tester)

```
test 5: Stäng period 1 → trigger 8 blockerar journal_entry i period 1
  - Stäng period 1
  - Försök INSERT journal_entry med entry_date i period 1
  - Förväntat: trigger 8 kastar RAISE(ABORT)

test 6: Reopen period 1 → journal_entry i period 1 lyckas igen
  - Stäng period 1
  - Öppna period 1
  - INSERT journal_entry med entry_date i period 1 → lyckas

test 7: Reopen avvisas om inte senast stängda
  - Stäng period 1 + period 2
  - Försök öppna period 1 → error PERIOD_NOT_SEQUENTIAL
  - Öppna period 2 → lyckas

test 8: Close avvisas om året är stängt
  - Manuellt: UPDATE fiscal_years SET is_closed = 1
  - Försök stänga period 1 → error YEAR_IS_CLOSED
```

### 18c. UI-logik (6 tester)

```
test 9: Sidebar visar företagsnamn
  - Rendera AppShell med en Company
  - Verifiera att company.name finns i DOM

test 10: Navigation byter aktiv sida
  - Rendera AppShell
  - Simulera klick på "Pengar in" nav-item
  - Verifiera att PageIncome renderas

test 11: PageHeader döljer action-knapp vid isReadOnly
  - Rendera PageHeader med action + isReadOnly context
  - Verifiera att action-knappen INTE finns i DOM

test 12: MonthIndicator visar rätt status
  - Mocka 3 stängda + 9 öppna perioder
  - Verifiera: 3 gröna, 1 blå (aktiv), 8 grå

test 13: MonthIndicator med brutet räkenskapsår (jul–jun)
  - Mocka perioder som börjar i juli
  - Verifiera att första rutan visar "J" (juli), inte "J" (januari)
  - Verifiera ordningen: J A S O N D J F M A M J

test 14: Årsväljare byter år → periodlistan uppdateras
  - Skapa 2 fiscal_years (eller mocka)
  - Byt år i context → verifiera att useFiscalPeriods anropas med nytt ID
```

---

## Steg 19: Verifieringschecklista

```
1. [ ] npm run lint → 0 errors
2. [ ] npm test → ~64 gröna tester (50 befintliga + ~14 nya)
3. [ ] npm run dev → sidebar med företagsnamn, K2/K3, årsväljare
4. [ ] Klicka på varje nav-item → rätt sida renderas
5. [ ] Översikt visar 4 metric cards (0 kr) + 12 perioder
6. [ ] Klicka "Stäng januari" → bekräfta → januari blir grön i månadsindikator
7. [ ] Klicka "Öppna januari" → januari blir öppen igen
8. [ ] Electron window title: "Fritt Bokföring — [Företagsnamn]"
9. [ ] Månadsindikator visar rätt färger
```

---

## Steg 20: Uppdatera decision_log.md

```markdown
## Session 4: Layout + Navigation

### Routing: useState med navigate-funktion
- useState<PageId> för toppnivå. Ingen React Router i v1.
- navigate('income') byter sida. Session 5 kan uppgradera om sub-vyer behövs.

### Årsväljare: global kontext i sidebar
- FiscalYearContext wrappas runt alla sidor
- Alla framtida data-queries tar fiscal_year_id (arkitekturprincip #14)
- Stängda år → read-only mode, action-knappar döljs

### Periodstängning: sekventiell
- Bara nästa öppna period kan stängas, bara senast stängda kan öppnas
- Trigger 8 i SQLite enforcar redan stängda perioder vid bokning
- Nya ErrorCodes: PERIOD_NOT_SEQUENTIAL, YEAR_IS_CLOSED

### Månadsindikator visar månadsnamn från start_date
- Inte från period_number — korrekt för brutet räkenskapsår
- toLocaleDateString('sv-SE') för svenska månadsnamn

### Persistence av valt räkenskapsår
- electron-store sparar last_fiscal_year_id
- Appen minns valt år vid omstart
- settings:get / settings:set IPC-kanaler (generiska, återanvänds av session 19+)

### "Alla perioder stängda"-meddelande
- Informationsruta visas när alla 12 perioder stängda men året ej stängt
- Bara information, ingen boksluts-logik (session 26)
```

---

## Ordning att bygga

1. `npm install electron-store` — persistence för valt år
2. `CLAUDE.md` — princip #14
3. `shared/types.ts` — PageId, FiscalYearContextValue, nya ErrorCodes
4. `ipc-schemas.ts` — Zod för period-operationer
5. `services/fiscal-service.ts` — all period/year-logik
6. `ipc-handlers.ts` — registrera 4 nya kanaler + settings:get/set
7. `preload.ts` — exponera 6 nya kanaler (4 fiscal + 2 settings)
7. `lib/hooks.ts` — 4 nya TanStack Query hooks
8. `contexts/FiscalYearContext.tsx` — global state
9. `components/layout/` — Sidebar, NavItem, YearPicker, MonthIndicator, PageHeader, ReadOnlyBanner
10. `components/overview/` — MetricCard, PeriodList
11. `pages/AppShell.tsx` — REFAKTORERA (byt ut placeholder-innehållet)
12. `pages/PageOverview.tsx` — metric cards + periodlista
13. `pages/` — 6 placeholder-sidor
14. Tester (test 1–14)
15. `decision_log.md` — uppdatera
16. Kör verifieringschecklista
17. Committa: `git add -A && git commit -m "session 4: layout + navigation + year picker + period closing"`
