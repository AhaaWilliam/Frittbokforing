# ADR 002 — Asset-edit efter första schedule-exekvering

**Status:** Implemented (interim Alt A, Sprint Q 2026-04-18). Revisor-
samråd kvar som framtida-utvärdering; om K2-praxis kräver Alt B för
rättelse-scenarier får Alt B implementeras ovanpå Alt A.
**Datum:** 2026-04-18 (Sprint F P3 draft, Sprint Q implementation)
**Ursprung:** T3.a backlog (Sprint E summary). Alt A accepterad som MVP
i Sprint Q — implementation följer sketchmocken nedan.

## Kontext

[depreciation-service.ts:321-327](../../src/main/services/depreciation-service.ts:321)
blockerar idag `updateFixedAsset` när minst ett schedule har status
`'executed'` eller `'skipped'`. Användaren får felkoden
`HAS_EXECUTED_SCHEDULES` och måste avyttra + återskapa om attribut
(nyttjandetid, restvärde, anskaffningsvärde) ska ändras.

Nuvarande pristine-guard är **konservativ by design** — den skyddar
historiska bokföringsposter men tvingar användare att göra en
workaround som skapar två tillgångar där det borde vara en.

**Öppen domän-fråga:** Ska edit efter exekvering tillåtas, och i så
fall hur hanteras:
1. Retroaktiv justering av redan bokförda avskrivningar?
2. Partial-executed schedules (några bokförda, några pending)?
3. Stängda räkenskapsår / stängda perioder?
4. Tillgångar som redan avyttrats (`status = 'disposed'`)?
5. Svensk BFL/K2/K3-praxis kring retroaktiv ändring av
   avskrivningsbas?

Dessa är **inte TS-frågor** — de är redovisningsbeslut som kräver
revisor-input innan implementation.

## Beslutsalternativ

### Alt A — Framtida perioder bara (rekommenderad för MVP)

Edit efter exekvering tillåts men **påverkar endast pending
schedules**. Bokförda schedules (`status = 'executed'`) rörs inte.
Nyttjandetid, restvärde eller anskaffningsvärde-ändring:
1. Beräknar ackumulerad avskrivning från redan exekverade rader
2. Omberäknar återstående belopp = `new_acquisition - residual -
   accumulated_executed`
3. Fördelar detta över återstående pending-perioder enligt ny
   nyttjandetid
4. Raderar existerande pending-rader + genererar nya
5. Inget C-serie-korrigeringsverifikat skapas

**Semantik:** Detta motsvarar "reviderad bedömning" i K2-praxis —
att den ursprungliga uppskattningen inte längre är korrekt och
framtida perioder ska anpassas. Historisk balans rörs inte.

**Fördelar:**
- Ingen interaktion med stängda perioder eller closed FY
- Ingen bokföringskorruption-risk (inget touches bokförd data)
- Implementeringen är lokal till schedule-genereringen

**Nackdelar:**
- Om ursprunglig anskaffningsvärde var helt fel (t.ex. +1 decimal)
  blir framtida avskrivning distorderad för att kompensera — inte
  redovisningsmässigt korrekt
- Ackumulerade värden i balansen reflekterar den felaktiga
  historiken

### Alt B — Retroaktiv justering via C-serie

Edit genererar ett C-serie-korrigeringsverifikat som reverserar
redan bokförda avskrivningar och bokar om dem med de nya värdena.
Payment-service-mönstret (Sprint A M154) återanvänds.

**Semantik:** Detta motsvarar "rättelse av fel" i K2-praxis — att
ursprungliga siffror var fel och måste korrigeras retroaktivt.
Historisk balans uppdateras.

**Fördelar:**
- Balansräkningen blir korrekt retroaktivt
- Fullständig audit-trail via korrigeringsverifikat (M140)

**Nackdelar (stora):**
- **Stängda perioder blockerar.** Trigger
  [trg_check_period_on_booking](../../src/main/migrations.ts:335)
  kastar `'Kan inte bokföra i stängd period.'` om C-serie-JE
  träffar stängd period eller stängt FY. Det betyder att Alt B de
  facto är **omöjlig** för tillgångar vars exekvering sträcker
  sig över periodbryt utan period-reopening (revisor-beslut i sig).
- Kräver matchning mot M140:s en-gångs-lås per JE — varje tidigare
  avskrivnings-JE får bara korrigeras en gång.
- Dispose-interaktion komplex: om tillgången redan avyttrats
  innehåller disposal-JE ackumulerad avskrivning vid disposal-datum;
  en retroaktiv justering måste spegla detta eller blockeras.
- Kräver revisor-godkännande per ändring (detta blir inte trivial
  användarfunktion — det är en rättelseverktyg).

### Alt C — Hybrid (villkorat val)

Små ändringar (t.ex. `|diff| ≤ 10 %` av anskaffningsvärde eller
`|diff_months| ≤ 3`) → Alt A (framtida). Större → Alt B (retroaktiv,
med period-reopening-prompt).

**Fördelar:**
- Matchar "reviderad bedömning" vs "rättelse av fel"-dikotomin

**Nackdelar:**
- Tröskeln är godtycklig — vem sätter 10%? (Detta blir en revisor-fråga
  i sig)
- Dubbel implementation + dubbel test-matris
- Rekommendationen för revisor är sannolikt "använd Alt B för
  rättelser, Alt A aldrig" — vilket gör hybriden onödig

## Rekommendation (draft)

**Alt A för MVP.** Skäl:
1. Ingen interaktion med closed-period-trigger → ingen
   defense-in-depth-konflikt
2. Ingen ny bokföringskorruption-surface
3. "Reviderad bedömning" är vanligt scenario (nyttjandetid justerad
   efter verklig användning). Förvaltas utan audit-overhead.
4. För "rättelse av fel" (Alt B-scenariot) kvarstår workarounden
   avyttra + återskapa, vilket är acceptabelt eftersom det är
   sällsynt och kräver revisor-diskussion ändå.

Alt B dokumenteras som framtida utökning om revisor anger att
retroaktiv justering är obligatorisk för vissa felklasser — men
först efter att closed-period-interaktionen hanteras (kräver
period-reopen-UX).

## M-princip-kandidat

**M155 (accepterad Sprint Q):** Asset-edit efter första schedule-
exekvering är tillåten men påverkar **endast pending-schedules**.
Exekverade rader är oförändrade. Ackumulerad avskrivning beräknas från
existerande bokförd data; återstående belopp fördelas över ny
nyttjandetid. Ingen C-serie-korrigering skapas.

Validering:
- `input.useful_life_months > executedCount` (där executedCount =
  antal schedules med status `'executed'` eller `'skipped'`)
- `input.acquisition_cost_ore - executedAccOre >= input.residual_value_ore`
  (bokfört värde efter executed måste täcka nytt restvärde)

Implementation: `updateFixedAsset` i
`src/main/services/depreciation-service.ts`. `insertPendingFromState`-
helper regenererar pending från period `executedCount + 1` med
`bookValueAfterExecuted` som input till `generateLinearSchedule`/
`generateDecliningSchedule`.

Tester: `session-C-depreciation-update.test.ts` inkluderar M155-tester
(bevarad historik, summa-invariant, validerings-gränser, skipped-
bevaring).

Undantag (om någonsin behövs i framtiden): Alt B-mönster med
period-reopening, kräver M-princip-utvidgning efter revisor-samråd.

## Open questions för revisor

1. **Svensk BFL/K2-praxis:** Är det acceptabelt att ändra
   avskrivningsbas (nyttjandetid, restvärde) efter första bokförda
   avskrivning? Under vilka omständigheter?
2. **Årsredovisnings-påverkan:** Måste ändringen motiveras i not
   eller styrelseprotokoll? Hur dokumenteras "reviderad bedömning"
   i audit-trail?
3. **Skiljelinje:** Hur skiljer man mellan "rättelse av fel" (kräver
   retroaktiv bokning) och "reviderad bedömning" (enbart framtida)?
   Finns det en skriven policy eller beror det på revisor-bedömning?
4. **Stängda perioder (Alt B):** Om en retroaktiv C-serie-korrigering
   måste bokföras i en stängd period — ska perioden öppnas om (med
   audit-trail), eller är korrigering blockerad och måste göras som
   manuell bokning i aktuell period?
5. **Disposal-interaktion:** Om tillgången redan avyttrats (och
   disposal-JE finns), är edit tillåten? Om ja — hur tolkas en
   retroaktiv ändring i relation till disposal-tidpunktens
   ack.-avskr.-värden?
6. **Anskaffningsvärde-ändring:** Är "ändra anskaffningsvärde efter
   bokföring" alltid en rättelse (Alt B), eller finns scenarier där
   det är legitimt framtida (t.ex. upptäckt investeringsbidrag som
   reducerar avskrivningsbasen)?

## Implementation-sketchmock (Alt A)

```ts
export function updateFixedAsset(db, id, input): IpcResult<{...}> {
  return db.transaction(() => {
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(id)
    if (!asset) return { success: false, code: 'NOT_FOUND', ... }
    if (asset.status !== 'active') return { success: false, ... }

    // REMOVED: HAS_EXECUTED_SCHEDULES-guard
    // NEW: branch on whether any schedules executed

    const executed = db.prepare(
      `SELECT COUNT(*) as n, COALESCE(SUM(amount_ore), 0) as acc_ore
       FROM depreciation_schedules
       WHERE fixed_asset_id = ? AND status = 'executed'`,
    ).get(id) as { n: number; acc_ore: number }

    // Account-change validation (redan existerande logik)
    const accountError = validateAccountChange(db, changedAccounts)
    if (accountError) return accountError

    // Delete ONLY pending schedules (bevara 'executed' + 'skipped')
    db.prepare(
      `DELETE FROM depreciation_schedules
       WHERE fixed_asset_id = ? AND status = 'pending'`,
    ).run(id)

    // Regenerate pending schedules with new attributes
    const remainingBaseOre =
      input.acquisition_cost_ore -
      input.residual_value_ore -
      executed.acc_ore
    const remainingMonths =
      input.useful_life_months - executed.n // OBS: edge-case om executed.n > input.useful_life_months

    // VALIDATION: new useful_life_months måste vara > executed.n
    if (input.useful_life_months <= executed.n) {
      return {
        success: false, code: 'VALIDATION_ERROR',
        error: `Ny nyttjandetid (${input.useful_life_months} mån) är kortare än redan exekverade perioder (${executed.n}).`,
      }
    }

    // VALIDATION: remainingBaseOre >= 0 (annars är restvärde > ack.avskr + nya kost)
    if (remainingBaseOre < 0) {
      return {
        success: false, code: 'VALIDATION_ERROR',
        error: `Nytt restvärde (${input.residual_value_ore / 100} kr) överstiger återstående bokfört värde.`,
      }
    }

    // Generate new pending-rows (återanvänd existerande generateSchedule-helper)
    const newScheduleCount = generatePendingSchedules(db, id, input, {
      startPeriod: executed.n + 1,
      baseOre: remainingBaseOre,
      remainingMonths,
    })

    // Update fixed_assets row
    db.prepare(
      `UPDATE fixed_assets SET ... WHERE id = ?`,
    ).run(...)

    return { success: true, data: { scheduleCount: executed.n + newScheduleCount } }
  })()
}
```

**Open implementation-frågor (Sprint H):**
- Hur hanteras `depreciation_method`-byte (linear → declining)?
  Antagligen tillåtet om executed-rader förblir linear.
- Deklineringsräntan (`declining_rate_bp`) — kan den ändras?
- Vad händer om nya nyttjandetid gör att alla schedules blir
  `'executed'` (dvs tillgången är helt avskriven)? Ska disposal-
  prompt triggas automatiskt?

## Konsekvenser

### Om Alt A implementeras

**Accepterade risker:**
- Ackumulerat värde i BR reflekterar historisk (möjligen felaktig)
  avskrivningsbas — användaren måste förstå att edit ≠ retroaktiv
  rättelse
- UI måste förklara skillnaden ("framtida avskrivningar anpassas,
  historik rörs inte")

**Bevarade invarianter:**
- Inget JE skapas eller ändras vid edit (endast schedule-rader)
- M140 en-gångs-lås orörd
- Closed-period-trigger orörd
- Disposal-interaktion: edit blockeras för `status !== 'active'`
  (existerande guard)

### Om Alt A inte implementeras

Nuvarande workaround kvarstår: dispose + återskapa. Dokumentera
detta tydligare i UI (idag ger felmeddelandet bara
`HAS_EXECUTED_SCHEDULES` utan förklaring).

## Trigger-villkor för omvärdering

ADR:n ska läsas om och potentiellt revideras om:

1. **Revisor anger att Alt B är obligatorisk** — specifikt att
   "rättelse av fel" i avskrivningsbas MÅSTE gå via retroaktiv
   C-serie-korrigering enligt svensk BFL/K2-praxis.
2. **Användare rapporterar Alt A otillräcklig** — insights från
   support/feedback visar att reviderad-bedömning-scenariot är
   minoritet och att rättelse-scenariot är vanligare än antaget.
3. **Period-reopen-UX blir ett Sprint-tema** — om framtida sprint
   implementerar period-reopen (för andra flöden), är
   closed-period-interaktionen löst och Alt B blir billigare.
4. **M140 utvidgas** — om chain-corrections tillåts (M140 revision),
   öppnar det Alt B-mönstret utan de-facto-blockeringen.

## Referenser

- M140 (korrigeringsverifikat en-gångs-lås)
- M93 (closePeriod atomicitet)
- M154 (unmatchBankTransaction via korrigeringsverifikat — samma
  mönster som Alt B skulle kräva)
- M151 (E-serie för avskrivningsverifikat — alla avskrivnings-JE
  som skulle korrigeras är i E-serien)
- [depreciation-service.ts:321](../../src/main/services/depreciation-service.ts:321)
  (nuvarande pristine-guard)
- [migrations.ts:335](../../src/main/migrations.ts:335)
  (trg_check_period_on_booking — Alt B-blockerare)
- Sprint F P3 prompt (skapandet av denna ADR): `docs/sprint-f-prompt.md`
