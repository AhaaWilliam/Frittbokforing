# Sprint 51 — Städsprint: flake-fix + M-principer + git-author

**Session:** S51  •  **Datum:** 2026-04-16  •  **Scope:** Städning (0 nya features, 0 migrationer, +3 M-principer)

## Resultat

| Metrik | Före | Efter |
|---|---|---|
| Vitest | 2255 pass | 2255 pass |
| E2E | 16/17 pass | **17/17 pass** ✅ |
| TSC errors | 0 | 0 |
| M-principer | M1–M144 | M1–M147 (+3) |
| PRAGMA user_version | 37 | 37 |

## 1. Bulk-payment-flake utredd

Testet `bulk-payment.spec.ts:78` "Drafts/paid är icke-selectable" hade flaggats som pre-existing i S49 och S50. Utredningen visade att testet, inte appen, var utdaterat.

### Grundorsak

`InvoiceList.isSelectable` är `item.status !== 'draft'` — paid-rader ÄR selectable, by design. Anledning: **PDF-batch-export** stödjer paid-fakturor (du vill kunna skicka PDF för redan-betalda fakturor). `InvoicePdf.test.tsx:P4` förklarar detta explicit:
> P4: checkbox appears for paid invoices (not just unpaid)

**Bulk-betala**-knappen har en separat gate som döljer den när paid ingår i urvalet (P6).

### Fix

Testet omdöpt och assertioner uppdaterade för att matcha faktiskt beteende:

```diff
-test('2. Drafts/paid är icke-selectable', ...)
+test('2. Drafts icke-selectable, paid selectable (för PDF-export)', ...)
-await expect(ctx.window.getByText('1 valda')).toBeVisible()
+await expect(ctx.window.getByText('2 valda')).toBeVisible()
+await expect(ctx.window.getByRole('button', { name: /bulk-betala/i })).toHaveCount(0)
```

### Felstart — kort återblick
Mitt första försök ändrade `InvoiceList.isSelectable` till `['unpaid', 'partial', 'overdue']` (spegel av ExpenseList). Det bröt `InvoicePdf.test.tsx:P4` och `P6` (2 tester röda) eftersom paid-rader ska vara selectable för PDF-export. Korrekt fix var att uppdatera E2E-testets förväntan, inte ändra appen.

## 2. Git author-config

Repot hade inga explicita `user.email`/`user.name` — commits föll tillbaka på systemdefault `william@Williams-MacBook-Pro.local`. Satt till användarens riktiga email från memory:

```bash
git config user.email "william.gebriel@gmail.com"
git config user.name "William Gebriel"
```

Framtida commits får korrekt författare. Historiska commits rewrites kräver separat beslut (destruktivt — `git rebase -i` påverkar delad historik och kräver force-push).

## 3. Tre nya M-principer i CLAUDE.md

Formaliserar mönster som stabiliserats över S47–S50.

### M145 — SIE4-import-strategier och I-serie (från S47/S48)

- `'new'` strategi: skapar company via createCompany, kräver tom DB
- `'merge'` strategi: matchar via orgNr, lägger till saknade konton
- Importerade verifikationer i **I-serien** (separerat från A/B/C/D)
- Sign handling: positiva → debit, negativa → credit (matchar export → roundtrip-konsistens)
- Obalanserade verifikat skippas med varning; okända konton rullar tillbaka hela importen

### M146 — Polymorfa payment-batch-operationer (från S50)

Operationer på `payment_batches` dispatchas via `batch.batch_type`. Delade queries använder domän-agnostiska fältnamn (`source_id`, `remittance_ref`). Grundad i S50:s symmetri-fix där invoice-branchen hade `NULL AS supplier_invoice_number` som aldrig nådde UI:n.

Framtida batch-operationer (BGC-returfiler, SEPA DD, batch-rapporter) ska implementeras polymorft från start.

### M147 — E2E dialog-bypass-varianter (från S49)

Fyra varianter i `src/main/utils/e2e-helpers.ts` + inline directory-bypass:

| Dialog-typ | Helper | Env-variabel |
|---|---|---|
| Save med default-filnamn | `getE2EFilePath(name, 'save')` | `E2E_DOWNLOAD_DIR` |
| Open-file med default-filnamn | `getE2EFilePath(name, 'open')` | `E2E_DOWNLOAD_DIR` + fil |
| Open-file utan default | `getE2EMockOpenFile()` | `E2E_MOCK_OPEN_FILE` |
| Open-directory | Inline check | `E2E_DOWNLOAD_DIR` |

Nya IPC-handlers som öppnar native dialoger MÅSTE inkludera bypass.

## Vad som INTE gjordes

- **Historiska commits rewrites** — destruktivt, kräver användar-beslut. Git-config satt för framtida commits.
- **Kodändringar i `InvoiceList.tsx`** — min initiala misstolkning reverterades. Appen är oförändrad; endast testet uppdaterades.
