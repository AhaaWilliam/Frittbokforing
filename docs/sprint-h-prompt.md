# Sprint H — Skeleton: Asset-edit efter första schedule-exekvering (F62-e)

**Status:** Skelett — väntar på revisor-samråd enligt ADR 002.
**Datum (skapad):** 2026-04-18 (Sprint F P3)
**Blocker:** Open questions i [ADR 002 § Open questions för revisor](adr/002-asset-edit-after-execution.md).

Detta dokument är en **tidig planering** för den sprint som
implementerar F62-e efter att ADR 002 övergått från draft till
accepterad. Innehållet är preliminärt — specifikationen kan ändras
baserat på revisor-input.

---

## Förutsättningar innan Sprint H påbörjas

Följande måste vara löst **INNAN** denna prompt kan köras:

1. **ADR 002 är accepterad** — status ändrad från "Draft" till
   "Accepterad". Revisor har svarat på de 6 open questions.
2. **Alt valt** — Alt A, Alt B eller Alt C bekräftad. Prompten
   nedan antar **Alt A** (rekommendation i ADR 002). Om annat alt
   väljs — omscopa prompten innan körning.
3. **M-princip-beslut** — M155 promotion till accepterad, alt.
   alternativ formulering godkänd.
4. **UX-text godkänd** — felmeddelanden och UI-förklaring
   ("reviderad bedömning, historik rörs inte") skrivna.

Om någon av dessa saknas → **kör inte denna sprint**. Gå tillbaka
till ADR 002-processen.

---

## Scope (förutsätter Alt A)

### Service-layer ([depreciation-service.ts](../src/main/services/depreciation-service.ts))

**1. Ta bort pristine-guard.**
Rad ~321–327: `HAS_EXECUTED_SCHEDULES`-check raderas.

**2. Lägg till executed-aware edit-path.**
- Räkna existerande `'executed'`-rader och ack. avskrivning
- Radera endast `'pending'`-rader (inte executed eller skipped)
- Validera: ny `useful_life_months` > antal executed-rader
- Validera: nytt restvärde ≤ återstående bokfört värde
- Validera: `depreciation_method`-byte tillåtet? (TBD — öppen fråga)
- Regenerera pending-rader med nya attribut

**3. Ny validering för `depreciation_method`-byte.**
Om executed-rader använder linear och edit byter till declining —
är det tillåtet? ADR 002 listar som öppen fråga. Default-antagande:
**tillåt** (framtida perioder följer ny metod, historisk orörd).

**4. Ingen ny IPC-kanal.** `depreciation:update-asset` (Sprint C)
behåller kontraktet — bara implementationen ändras.

### Renderer-layer

**5. UI-varning när edit görs på tillgång med executed-rader.**
Ny ConfirmDialog (M133, role="alertdialog") med varningstext:

> **Ändra en tillgång med avskrivningshistorik?**
>
> Tillgången har {N} redan bokförd(a) avskrivning(ar).
> Denna ändring påverkar endast framtida perioder (pending
> schedules). Historiska avskrivningar rörs inte.
>
> - Nytt återstående belopp = {new_acquisition} - {residual} -
>   {accumulated_executed} = {remaining_ore} kr
> - Fördelas över {remaining_months} månader
> - {new_schedule_count} nya rader ersätter {deleted_pending_count}
>   pending-rader
>
> Ingen C-serie-korrigeringsverifikat skapas. Om den ursprungliga
> bokföringen var felaktig — använd manuellt korrigeringsverifikat
> istället.
>
> [Avbryt] [Ändra]

### Test-scope (estimat ~15 nya tester)

**Service-integration:**
- Edit utan executed-rader → fungerar som tidigare (regressions-skydd)
- Edit med 3 executed-rader + 9 pending → executed orörda, 9 nya pending
- Validering: `useful_life_months <= executed_count` → `VALIDATION_ERROR`
- Validering: nytt restvärde > återstående bokfört värde →
  `VALIDATION_ERROR`
- `depreciation_method`-byte från linear → declining (om tillåtet)
- Ack-avskrivning i BR oförändrad efter edit (invariant-test)
- Dispose efter edit fungerar korrekt
- Edit + subsequent execute-period → nästa pending-rad bokförs
  korrekt
- Edit av `residual_value_ore` → återstående belopp omfördelas

**Renderer-integration:**
- UI visar varningsdialog när tillgången har executed-rader
- UI visar inte dialog när tillgången är pristine
- Preview av nya scheduler visas i dialog (om UX-spec kräver)

**E2E:**
- Happy path: skapa asset → execute 2 perioder → edit nyttjandetid
  → verifiera att pending-rader uppdaterade men executed orörda

---

## Uteslutet (inte Sprint H)

- Alt B-implementation (retroaktiv C-serie) — se ADR 002 §Alt B
- Period-reopen-UX — kräver egen sprint
- Chain-corrections (revidera M140) — stor arkitektur-ändring

---

## Invarianter att bevara

- **M140 en-gångs-lås orörd.** Edit skapar inte några JE.
- **trg_check_period_on_booking orörd.** Ingen bokning mot stängda
  perioder.
- **M151 E-serie orörd.** Existerande avskrivningsverifikat
  oförändrade.
- **Balans-triggern orörd.** Edit påverkar inte journal_entry_lines.

---

## Estimat

- Service-ändring + validering: 1 SP
- Renderer-dialog + varningstext: 0.5 SP
- Tester (15 nya): 1–1.5 SP
- E2E: 0.5 SP
- **Totalt: 3–3.5 SP** (under 1 sprint).

Om revisor kräver Alt B istället — estimat skalerar till 5–8 SP
pga closed-period-interaktion + C-serie-integration + M140-
utvidgning.

---

## STOP-villkor

- Om implementationen kräver ny migration → re-scopa (Alt A ska
  inte kräva schema-ändring)
- Om testet visar att BR-ack-avskrivning förändras → bugg i
  delete-logik, STOP och audit
- Om dispose-edit-interaktion blir komplex → lämna som Sprint I

---

## Referenser

- [ADR 002](adr/002-asset-edit-after-execution.md) — blockerande
  domän-fråga
- [Sprint F P3-prompt](sprint-f-prompt.md) — ADR-ursprunget
- M155 (draft i ADR 002)
- M140, M151 (invarianter som bevaras)
