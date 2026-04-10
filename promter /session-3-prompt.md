# Session 3: Onboarding — Skapa företag + räkenskapsår + perioder

## Kontext

Du arbetar i `~/fritt-bokforing/`, ett Electron + React + TypeScript-projekt.

**Vad som redan finns (session 1 + 2):**
- Electron + React 18 + TypeScript (strict) + Tailwind CSS + shadcn/ui
- SQLite via better-sqlite3 (WAL-läge), PRAGMA user_version = 33
- 13 tabeller med CHECK constraints, indexes, FK
- 8 triggers: immutabilitet (5), fakturaskydd (1), balansvalidering (1), periodvalidering (1)
- ~104 BAS-konton (K2/K3-märkta) + 7 momskoder med SKV report_box
- IPC-grundstruktur med contextBridge (preload.ts)
- Zod + TanStack Query installerat
- ESLint + Prettier konfigurerat
- Vitest med 34 gröna tester (5 session 1 + 29 session 2)
- `CLAUDE.md` med 12 arkitekturprinciper

**Läs innan du börjar:**
- `CLAUDE.md` — arkitekturprinciper (alla 12 gäller)
- `src/main/db.ts` — nuvarande databassetup och migrationsmönster
- `src/main/ipc-handlers.ts` — nuvarande IPC-registrering
- `src/main/ipc-schemas.ts` — nuvarande Zod-scheman
- `src/main/preload.ts` — nuvarande contextBridge
- `src/shared/types.ts` — nuvarande delade typer
- `src/renderer/App.tsx` — nuvarande app-komponent

---

## Mål

Bygg onboarding-wizarden — det första användaren ser vid nystart. Wizarden samlar in företagsuppgifter och skapar företag, räkenskapsår och 12 perioder i en enda transaktion.

**Sessionen levererar:**
1. Onboarding-wizard (3 steg) i renderer
2. 2 nya IPC-kanaler med Zod-validering i main process
3. Transaktionslogik: 1 company + 1 fiscal_year + 12 fiscal_periods
4. App-routing: wizard vs placeholder-shell
5. ~16 nya tester (totalt ~50)

**Sessionen levererar INTE:**
- Redigering av företagsuppgifter
- Förkortat/förlängt första räkenskapsår (kräver schemaändring)
- Automatisk K3-tvångskontroll
- Flerföretagsstöd (en DB per företag)
- Dashboard-logik (session 4)
- SIE-import av ingående balanser
- Auto-verifikation av aktiekapital (Debet 1930 / Kredit 2081 — rör journal_entries + triggers, bättre i session 6)

---

## Steg 1: Lägg till arkitekturprincip #13 i CLAUDE.md

Lägg till denna princip efter #12:

```
## 13. K2/K3-filtrering sker vid runtime
`companies.fiscal_rule` är enda sanningskällan. Alla queries mot `accounts`
filtrerar med WHERE-villkor baserat på fiscal_rule. Duplicera aldrig regelval
i accounts-data. Markera aldrig konton som aktiva/inaktiva vid skapelse.
```

---

## Steg 1b: Migration 004 — CHECK-trigger på org_number (defense in depth)

Skapa en ny migration som lägger till format-validering direkt i SQLite. Detta fångar felaktig data även om framtida kod kringgår IPC-lagret.

SQLite stöder inte REGEXP utan extension och kan inte ALTER TABLE ADD CONSTRAINT, så använd en BEFORE INSERT trigger:

```sql
-- Migration 004: org_number format validation (defense in depth)
CREATE TRIGGER IF NOT EXISTS trg_validate_org_number
BEFORE INSERT ON companies
BEGIN
  SELECT CASE
    WHEN LENGTH(NEW.org_number) != 11 THEN
      RAISE(ABORT, 'org_number must be exactly 11 characters (NNNNNN-NNNN)')
    WHEN SUBSTR(NEW.org_number, 7, 1) != '-' THEN
      RAISE(ABORT, 'org_number must have hyphen at position 7')
    WHEN SUBSTR(NEW.org_number, 1, 1) NOT IN ('5','6','7','8','9') THEN
      RAISE(ABORT, 'org_number first digit must be 5-9 for AB')
  END;
END;
```

Uppdatera `PRAGMA user_version` till 34 efter migrationen.

VIKTIGT: Luhn-kontrollen görs INTE i SQLite (för komplex för en trigger). Den sköts av Zod i IPC-lagret. Triggern fångar bara format-avvikelser som sista försvarslinje.

---

## Steg 2: Delade typer (src/shared/types.ts)

Lägg till dessa typer. De används av main process, renderer och tester.

```typescript
// === IPC Result type (ALLA IPC-kanaler använder detta) ===
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode; field?: string };

// Standardiserade felkoder — gör det enkelt för frontend att visa rätt meddelande
// field? = valfritt fältnamn så frontend kan visa felet under rätt input-fält
// Ex: { success: false, error: "Finns redan", code: 'DUPLICATE_ORG_NUMBER', field: 'org_number' }
//   → React visar rött under org_number-fältet, inte en generell toast
export type ErrorCode =
  | 'VALIDATION_ERROR'        // Zod-validering misslyckades
  | 'DUPLICATE_ORG_NUMBER'    // UNIQUE constraint på org_number
  | 'PERIOD_GENERATION_ERROR' // Periodgenerering misslyckades
  | 'TRANSACTION_ERROR'       // Generellt databasfel
  | 'NOT_FOUND';              // Entitet saknas

// === Company ===
export interface Company {
  id: number;
  name: string;
  org_number: string;
  fiscal_rule: 'K2' | 'K3';
  share_capital: number; // ören (heltal)
  registration_date: string; // ISO date
  board_members: string | null;
  created_at: string;
  updated_at: string;
}

// === Fiscal Year ===
export interface FiscalYear {
  id: number;
  company_id: number;
  start_date: string; // ISO date
  end_date: string;   // ISO date
  is_closed: 0 | 1;
  annual_report_status: string;
}

// === Fiscal Period ===
export interface FiscalPeriod {
  id: number;
  fiscal_year_id: number;
  period_number: number; // 1-12
  start_date: string;    // ISO date
  end_date: string;      // ISO date
  is_closed: 0 | 1;
}

// === Create Company Input (renderer → main) ===
export interface CreateCompanyInput {
  name: string;
  org_number: string;
  fiscal_rule: 'K2' | 'K3';
  share_capital: number; // ören
  registration_date: string;
  board_members?: string | null;
  fiscal_year_start: string; // ISO date
  fiscal_year_end: string;   // ISO date
}
```

---

## Steg 3: Zod-scheman (src/main/ipc-schemas.ts)

Lägg till dessa scheman. VIKTIGT: Zod-schemat MÅSTE matcha SQLite CHECK constraints exakt.

### 3a. Luhn-validering (hjälpfunktion)

```typescript
/**
 * Luhn-kontroll (modulus 10) för svenska organisationsnummer.
 * Input: 10 siffror utan bindestreck (t.ex. "5561234567").
 * Returnerar true om sista siffran är korrekt kontrollsiffra.
 */
function luhnCheck(orgNumber: string): boolean {
  // Ta bort bindestreck
  const digits = orgNumber.replace('-', '');
  if (digits.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let digit = parseInt(digits[i], 10);
    // Varannan siffra (från vänster, 0-indexerad) multipliceras med 2
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
```

### 3b. CreateCompanyInput schema

```typescript
export const CreateCompanyInputSchema = z.object({
  name: z.string()
    .min(2, 'Företagsnamnet måste vara minst 2 tecken')
    .max(200, 'Företagsnamnet får vara max 200 tecken'),

  org_number: z.string()
    .regex(
      /^[5-9]\d{5}-\d{4}$/,
      'Organisationsnummer måste ha formatet NNNNNN-NNNN där första siffran är 5-9'
    )
    .refine(luhnCheck, 'Ogiltigt organisationsnummer (kontrollsiffran stämmer inte)'),

  fiscal_rule: z.enum(['K2', 'K3']),

  share_capital: z.number()
    .int('Aktiekapital måste vara ett heltal (ören)')
    .min(2_500_000, 'Aktiekapital måste vara minst 25 000 kr'),

  registration_date: z.string()
    .date('Ogiltigt datumformat')
    .refine(
      (d) => new Date(d) <= new Date(),
      'Registreringsdatum kan inte vara i framtiden'
    ),

  board_members: z.string().max(1000).nullable().optional(),

  fiscal_year_start: z.string().date('Ogiltigt datumformat'),
  fiscal_year_end: z.string().date('Ogiltigt datumformat'),
}).refine(
  (data) => new Date(data.fiscal_year_end) > new Date(data.fiscal_year_start),
  { message: 'Räkenskapsårets slut måste vara efter start', path: ['fiscal_year_end'] }
);
```

---

## Steg 4: Company service (src/main/services/company-service.ts)

Ny fil. All affärslogik för onboarding i en plats.

### 4a. Periodgenerering

```typescript
export interface GeneratedPeriod {
  period_number: number;
  start_date: string;
  end_date: string;
}

/**
 * Genererar 12 perioder för ett räkenskapsår.
 *
 * Regler:
 * - Varje period = 1 kalendermånad
 * - start_date = 1:a i månaden
 * - end_date = sista dagen i månaden
 * - Hanterar skottår (feb 29)
 * - Hanterar brutet räkenskapsår (perioder som spänner två kalenderår)
 *
 * Invarianter som MÅSTE gälla efter generering:
 * 1. Exakt 12 perioder
 * 2. periods[0].start_date === fiscalYearStart
 * 3. periods[11].end_date === fiscalYearEnd
 * 4. Varje period: end_date > start_date
 * 5. Inga gap: periods[n+1].start_date = dag efter periods[n].end_date
 * 6. Inga överlapp: periods[n].end_date < periods[n+1].start_date
 */
export function generatePeriods(
  fiscalYearStart: string,
  fiscalYearEnd: string
): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  const start = new Date(fiscalYearStart);

  for (let i = 0; i < 12; i++) {
    const periodStart = new Date(
      start.getFullYear(),
      start.getMonth() + i,
      1
    );

    // Sista dagen i månaden: gå till 1:a nästa månad, backa 1 dag
    const periodEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth() + 1,
      0
    );

    periods.push({
      period_number: i + 1,
      start_date: formatDate(periodStart),
      end_date: formatDate(periodEnd),
    });
  }

  // Validera invarianter INNAN return
  validatePeriodInvariants(periods, fiscalYearStart, fiscalYearEnd);

  return periods;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function validatePeriodInvariants(
  periods: GeneratedPeriod[],
  fyStart: string,
  fyEnd: string
): void {
  if (periods.length !== 12) {
    throw new Error(`Invariant: Förväntade 12 perioder, fick ${periods.length}`);
  }
  if (periods[0].start_date !== fyStart) {
    throw new Error(
      `Invariant: Period 1 start (${periods[0].start_date}) ≠ räkenskapsår start (${fyStart})`
    );
  }
  if (periods[11].end_date !== fyEnd) {
    throw new Error(
      `Invariant: Period 12 slut (${periods[11].end_date}) ≠ räkenskapsår slut (${fyEnd})`
    );
  }
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].end_date <= periods[i].start_date) {
      throw new Error(
        `Invariant: Period ${i + 1} end_date (${periods[i].end_date}) <= start_date (${periods[i].start_date})`
      );
    }
    if (i > 0) {
      const prevEnd = new Date(periods[i - 1].end_date);
      const nextDay = new Date(prevEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      const expected = formatDate(nextDay);
      if (periods[i].start_date !== expected) {
        throw new Error(
          `Invariant: Gap/överlapp mellan period ${i} och ${i + 1}: ` +
          `${periods[i - 1].end_date} → ${periods[i].start_date} (förväntat ${expected})`
        );
      }
    }
  }
}
```

### 4b. createCompany (transaktionslogik)

```typescript
import type { Database } from 'better-sqlite3';
import type { CreateCompanyInput, Company, IpcResult } from '../../shared/types';
import { CreateCompanyInputSchema } from '../ipc-schemas';

export function createCompany(
  db: Database,
  input: unknown
): IpcResult<Company> {
  // 1. Zod-validera
  const parsed = CreateCompanyInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR' as const,
    };
  }
  const data = parsed.data;

  try {
    // 2. Generera perioder INNAN transaktionen (om det misslyckas vill vi inte ha påbörjat transaktion)
    let periods;
    try {
      periods = generatePeriods(data.fiscal_year_start, data.fiscal_year_end);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Periodgenerering misslyckades',
        code: 'PERIOD_GENERATION_ERROR' as const,
      };
    }

    // 3. Kör allt i EN transaktion
    const result = db.transaction(() => {
      // a) INSERT company
      const companyStmt = db.prepare(`
        INSERT INTO companies (name, org_number, fiscal_rule, share_capital, registration_date, board_members)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const companyResult = companyStmt.run(
        data.name,
        data.org_number,
        data.fiscal_rule,
        data.share_capital,
        data.registration_date,
        data.board_members ?? null
      );
      const companyId = Number(companyResult.lastInsertRowid);

      // b) INSERT fiscal_year
      const fyStmt = db.prepare(`
        INSERT INTO fiscal_years (company_id, start_date, end_date)
        VALUES (?, ?, ?)
      `);
      const fyResult = fyStmt.run(companyId, data.fiscal_year_start, data.fiscal_year_end);
      const fiscalYearId = Number(fyResult.lastInsertRowid);

      // c) INSERT 12 fiscal_periods
      const periodStmt = db.prepare(`
        INSERT INTO fiscal_periods (fiscal_year_id, period_number, start_date, end_date)
        VALUES (?, ?, ?, ?)
      `);
      for (const period of periods) {
        periodStmt.run(
          fiscalYearId,
          period.period_number,
          period.start_date,
          period.end_date
        );
      }

      // d) Hämta det skapade företaget för retur
      const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) as Company;
      return company;
    })();

    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel';
    // UNIQUE constraint → specifik felkod + användarvänligt meddelande
    if (message.includes('UNIQUE constraint') && message.includes('org_number')) {
      return { success: false, error: 'Ett företag med detta organisationsnummer finns redan.', code: 'DUPLICATE_ORG_NUMBER' as const, field: 'org_number' };
    }
    return { success: false, error: message, code: 'TRANSACTION_ERROR' as const };
  }
}

export function getCompany(db: Database): Company | null {
  const row = db.prepare('SELECT * FROM companies LIMIT 1').get();
  return (row as Company) ?? null;
}
```

---

## Steg 5: IPC-handlers (src/main/ipc-handlers.ts)

Registrera de nya kanalerna. VIKTIGT: Följ `entity:action`-mönstret exakt — det blir mall för alla framtida sessioner.

```typescript
// Lägg till i befintlig registerIpcHandlers-funktion:

ipcMain.handle('company:create', (_event, input: unknown) => {
  return createCompany(db, input);
});

ipcMain.handle('company:get', () => {
  return getCompany(db);
});
```

---

## Steg 6: Preload (src/main/preload.ts)

Exponera de nya kanalerna via contextBridge.

```typescript
// Lägg till i befintlig api-objekt:
createCompany: (data: CreateCompanyInput) =>
  ipcRenderer.invoke('company:create', data),
getCompany: () =>
  ipcRenderer.invoke('company:get'),
```

Se till att typerna importeras från `shared/types.ts` och att `preload.ts` exporterar rätt typer för renderer.

---

## Steg 7: TanStack Query hooks (src/renderer/lib/hooks.ts)

Ny fil med hooks som wrapprar IPC-anropen.

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Company, CreateCompanyInput, IpcResult } from '../../shared/types';

export function useCompany() {
  return useQuery<Company | null>({
    queryKey: ['company'],
    queryFn: () => window.api.getCompany(),
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation<IpcResult<Company>, Error, CreateCompanyInput>({
    mutationFn: (data) => window.api.createCompany(data),
    onSuccess: (result) => {
      if (result.success) {
        // Invalidera company-query → routing skiftar från wizard till app-shell
        queryClient.invalidateQueries({ queryKey: ['company'] });
      }
    },
  });
}
```

---

## Steg 8: App-routing (src/renderer/App.tsx)

Uppdatera App.tsx med routing baserat på om företag finns.

```tsx
import { useCompany } from './lib/hooks';
import { OnboardingWizard } from './pages/OnboardingWizard';
import { AppShell } from './pages/AppShell';

export default function App() {
  const { data: company, isLoading } = useCompany();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  if (!company) {
    return <OnboardingWizard />;
  }

  return <AppShell company={company} />;
}
```

---

## Steg 9: Wizard-komponenter (renderer)

### 9a. OnboardingWizard (src/renderer/pages/OnboardingWizard.tsx)

3-stegs wizard med `useReducer` för steghantering.

**State:**
```typescript
type WizardStep = 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
  // Steg 1
  name: string;
  org_number: string;
  fiscal_rule: 'K2' | 'K3';
  share_capital: string; // string i formulär, konverteras till ören vid submit
  registration_date: string;
  board_members: string;
  // Steg 2
  use_broken_fiscal_year: boolean;
  fiscal_year_start_month: number; // 1-12, default 1
}
```

**Stegnavigation:** Visa tydlig stepper/progress (3 steg). Användaren kan gå bakåt men inte framåt utan validering. Använd shadcn/ui Card, Button, Input, Select.

### 9b. StepCompany (src/renderer/components/wizard/StepCompany.tsx)

**Fält och labels (EXAKT dessa — inga bokföringstermer):**

| Fält | Label | Hjälptext | Komponent |
|------|-------|-----------|-----------|
| name | "Vad heter ditt företag?" | — | Input |
| org_number | "Organisationsnummer" | "Hittar du på Bolagsverket eller i registreringsbeviset" | Input med mask NNNNNN-NNNN |
| fiscal_rule | "Vilken redovisningsregel använder du?" | Se nedan | Radio/Select med 2 val |
| share_capital | "Insatt aktiekapital vid registrering" | "Beloppet du satte in när bolaget startades. Minst 25 000 kr." | Input (kr, konverteras till ören) |
| registration_date | "När registrerades bolaget?" | "Står i registreringsbeviset" | Datumväljare |

**K2/K3-presentation (VIKTIGT — aldrig bara "K2"/"K3"):**
- **"Förenklad redovisning (K2)"** — beskrivning: "För mindre bolag som vill ha enklare regler. Standardvalet."
- **"Fullständig redovisning (K3)"** — beskrivning: "För bolag som växer, äger fastigheter, har komplexa tillgångar, eller ingår i en koncern."
- Default: K2 förvalt.

**Validering i renderer (preview, inte slutgiltig):**
- Namn: minst 2 tecken
- Orgnummer: formatmask + visuell feedback (grön bock/röd varning)
- Aktiekapital: >= 25 000 kr
- Registreringsdatum: inte i framtiden

### 9c. StepFiscalYear (src/renderer/components/wizard/StepFiscalYear.tsx)

**Default-läge (kalenderår):**
Visa text: "Ditt första bokföringsår: 1 januari [ÅR] — 31 december [ÅR]"
Året beräknas från registreringsdatum:
- Om registrerad 2026 → 2026
- Om registrerad 2025 → 2025 (men detta är det NUVARANDE eller NÄSTA kalenderåret — använd `new Date().getFullYear()` som default om registreringsdatum saknar logik)

**Toggle: "Mitt företag har brutet räkenskapsår"**
När aktiv:
- Dropdown: "Startmånad" (januari–december)
- Slutdatum beräknas automatiskt: startmånad + 11 månader → sista dagen i slutmånaden
- Preview-text: "1 juli 2026 — 30 juni 2027"

**ALDRIG synligt:** "perioder", "fiscal_periods", "period_number"

**Viktig UX-varning:**
Om registreringsdatumet (från steg 1) är mindre än 12 månader sedan, visa en informationsruta (shadcn Alert med `variant="info"`):
> "Just nu stöder Fritt Bokföring räkenskapsår på 12 hela månader. Stöd för förkortat eller förlängt första räkenskapsår (som är vanligt för nystartade bolag) kommer i en senare version."
Detta förhindrar att nystartade AB-ägare fastnar utan att förstå varför deras första år inte matchar.

### 9d. StepConfirm (src/renderer/components/wizard/StepConfirm.tsx)

Sammanfattningskort med all data från steg 1 och 2:
- Företagsnamn
- Organisationsnummer
- Redovisningsregel (K2/K3 med den användarvänliga texten)
- Aktiekapital (formaterat i kr, t.ex. "25 000 kr")
- Registreringsdatum
- Bokföringsår (start — slut)

Knappar: "Tillbaka" och **"Starta bokföringen"**

**Vid klick på "Starta bokföringen":**
1. Konvertera `share_capital` från kr-string till ören-integer: `Math.round(parseFloat(value) * 100)`
2. Beräkna `fiscal_year_start` och `fiscal_year_end` baserat på wizard-state
3. Anropa `createCompany` mutation
4. Visa laddningsindikator under mutation
5. Vid `success: false` → visa felmeddelandet i UI (t.ex. toast eller alert)
6. Vid `success: true` → TanStack Query invaliderar `['company']` → App.tsx renderar AppShell

### 9e. AppShell placeholder (src/renderer/pages/AppShell.tsx)

Minimal placeholder som session 4 bygger vidare på.

```tsx
interface AppShellProps {
  company: Company;
}

export function AppShell({ company }: AppShellProps) {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">
          Välkommen till {company.name}
        </h1>
        <p className="text-muted-foreground">
          Bokföringen är redo. Mer kommer i nästa uppdatering.
        </p>
      </div>
    </div>
  );
}
```

---

## Steg 10: Tester

Skriv ~16 tester i en ny fil `tests/session-3.test.ts` (eller dela upp om det blir tydligare).

### 10a. Zod-validering (4 tester)

```
test 1: Giltigt input passerar CreateCompanyInputSchema
  - Använd: { name: "Test AB", org_number: "556036-0793", fiscal_rule: "K2",
    share_capital: 2500000, registration_date: "2026-01-15",
    fiscal_year_start: "2026-01-01", fiscal_year_end: "2026-12-31" }
  - OBS: 556036-0793 = Volvo (giltigt Luhn). Använd ett känt giltigt nummer.

test 2: Ogiltigt orgnummer (fel Luhn-kontrollsiffra) → avvisas
  - Byt sista siffran i ett giltigt nummer (t.ex. 556036-0794)

test 3: Aktiekapital < 25 000 kr (2500000 ören) → avvisas
  - Testa med share_capital: 2499999

test 4: Saknat obligatoriskt fält (name) → avvisas
```

### 10b. Defense in depth — org_number trigger (1 test)

```
test 5: SQLite-trigger avvisar ogiltigt org_number-format
  - Bypass Zod: kör INSERT direkt mot companies med org_number "1234567890" (ingen bindestreck)
  - Förväntat: RAISE(ABORT) från trg_validate_org_number
  - Testa även: org_number "123456-7890" (siffra 1 < 5) → avvisas
```

### 10c. Periodgenerering (5 tester)

```
test 6: Kalenderår 2026
  - Input: "2026-01-01", "2026-12-31"
  - Förväntat: 12 perioder
  - P1: 2026-01-01 → 2026-01-31
  - P2: 2026-02-01 → 2026-02-28 (2026 är INTE skottår)
  - P12: 2026-12-01 → 2026-12-31

test 7: Skottår 2028
  - Input: "2028-01-01", "2028-12-31"
  - P2 end_date MÅSTE vara "2028-02-29"

test 8: Brutet räkenskapsår juli 2026 – juni 2027
  - Input: "2026-07-01", "2027-06-30"
  - P1: 2026-07-01 → 2026-07-31
  - P7: 2027-01-01 → 2027-01-31
  - P12: 2027-06-01 → 2027-06-30
  - Exakt 12 perioder

test 9: Inga gap mellan perioder
  - För VARJE par (period[n], period[n+1]):
    period[n+1].start_date === dayAfter(period[n].end_date)
  - Testa med minst kalenderår och brutet år

test 10: Trigger 8-kompatibilitet (VIKTIGT — fångar fördröjda buggar)
  - Skapa en company + fiscal_year + 12 periods via createCompany()
  - Försök INSERT en journal_entry med entry_date i period 1
  - Verifiera att trigger 8 (periodvalidering) INTE kastar fel
  - Om detta test misslyckas har vi felaktiga perioder som blockerar ALL bokning
```

### 10d. Transaktion och integritet (3 tester)

```
test 11: Lyckad transaktion skapar 1 + 1 + 12 rader
  - Anropa createCompany med giltigt input
  - Verifiera: SELECT COUNT(*) FROM companies = 1
  - Verifiera: SELECT COUNT(*) FROM fiscal_years = 1
  - Verifiera: SELECT COUNT(*) FROM fiscal_periods = 12

test 12: Duplicerat orgnummer → rollback
  - Anropa createCompany två gånger med samma org_number
  - Första: success: true
  - Andra: success: false, error innehåller "finns redan"
  - Verifiera att det fortfarande bara finns 1 company, 1 fiscal_year, 12 periods

test 13: K2/K3 sparas korrekt
  - Skapa med fiscal_rule: "K3"
  - Hämta med getCompany()
  - Verifiera att company.fiscal_rule === "K3"
```

### 10e. IPC round-trip (2 tester)

```
test 14: getCompany() på tom databas → returnerar null

test 15: createCompany() → getCompany() returnerar det skapade företaget
  - Verifiera att alla fält matchar input (name, org_number, fiscal_rule, etc.)
```

### 10f. Routing (1 test)

```
test 16: Om company === null → OnboardingWizard renderas
  - Mocka useCompany() att returnera { data: null, isLoading: false }
  - Verifiera att App renderar OnboardingWizard-komponenten
  - (Om detta är svårt att testa med nuvarande setup, gör det som en enkel rendering-test
    eller skippmarkera den med en kommentar)
```

---

## Steg 11: Verifieringschecklista

Efter att allt är implementerat, verifiera följande:

```
1. [ ] npm run lint → 0 errors
2. [ ] npm test → ~50 gröna tester (34 befintliga + ~16 nya)
3. [ ] npm run dev → wizard visas vid första start
4. [ ] Fyll i alla fält korrekt → klicka "Starta bokföringen"
       → wizard försvinner, "Välkommen till [namn]" visas
5. [ ] Stäng appen → öppna igen → app-shell visas direkt (ingen wizard)
6. [ ] I DevTools Console: inga errors
7. [ ] SQLite-verifiering (via DevTools eller separat script):
       SELECT COUNT(*) FROM companies → 1
       SELECT COUNT(*) FROM fiscal_years → 1
       SELECT COUNT(*) FROM fiscal_periods → 12
       SELECT start_date, end_date FROM fiscal_periods ORDER BY period_number
       → inga gap, inga överlapp
```

---

## Steg 12: Uppdatera decision_log.md

Lägg till följande beslut:

```markdown
## Session 3: Onboarding

### Orgnummer: full Luhn-validering
- Format NNNNNN-NNNN, siffra 1 = 5-9, modulus 10
- Motivering: konsekvent med övrig precision i projektet (104 BAS-konton, SKV report_box)

### Brutet räkenskapsår: stöds med avgränsning
- Kalenderår (default) eller brutet (välj startmånad, alltid 12 hela månader)
- INTE förkortat/förlängt första år i v1 (CHECK constraint kräver 1-12 perioder)

### En databas per företag
- Inget flerföretagsstöd. company:get returnerar 1 eller null.

### K2/K3 filtreras vid runtime (arkitekturprincip #13)
- fiscal_rule i companies = enda sanningskällan
- Alla framtida queries mot accounts filtrerar baserat på fiscal_rule

### IPC-mönster: entity:action + IpcResult<T> + ErrorCode
- Namnkonvention: entity:action (company:create, company:get)
- Alla handlers returnerar IpcResult<T> = { success, data/error, code, field? }
- Standardiserade ErrorCode: VALIDATION_ERROR, DUPLICATE_ORG_NUMBER, PERIOD_GENERATION_ERROR, TRANSACTION_ERROR, NOT_FOUND
- field? mappar felkod till specifikt formulärfält (t.ex. DUPLICATE_ORG_NUMBER → org_number-fältet)
- Mönstret gäller för ALLA framtida IPC-kanaler

### Defense in depth: org_number-trigger i SQLite
- Migration 004: BEFORE INSERT trigger på companies validerar format (längd, bindestreck, siffra 1)
- Luhn-validering enbart i Zod (för komplex för SQL-trigger)
- Motivering: fångar felaktig data om framtida kod kringgår IPC-lagret

### Säkerhet: unencrypted at rest (accepterat i v1)
- data.db ligger okrypterad på disk. Vid stöld av datorn exponeras all finansiell data.
- Acceptabelt i MVP: målgruppen är små AB, inte enterprise.
- Framtida förbättring: SQLCipher för krypterad SQLite.
```

---

## Ordning att bygga

1. `CLAUDE.md` — princip #13
2. Migration 004 — org_number format-trigger (defense in depth)
3. `shared/types.ts` — delade typer
4. `ipc-schemas.ts` — Zod + Luhn
5. `services/company-service.ts` — periodgenerering + createCompany + getCompany
6. `ipc-handlers.ts` — registrera kanaler
7. `preload.ts` — exponera via contextBridge
8. `lib/hooks.ts` — TanStack Query hooks
9. `App.tsx` — routing
10. Wizard-komponenter (OnboardingWizard → StepCompany → StepFiscalYear → StepConfirm)
11. `AppShell.tsx` — placeholder
12. Tester (test 1-16)
13. `decision_log.md` — uppdatera
14. Kör verifieringschecklista
15. Committa: `git add -A && git commit -m "session 3: onboarding wizard + IPC pattern"`
