## Appendix A — Existerande M-regler relevanta för F19/F4

### M96 (single source of truth för resultat-beräkning)

All beräkning av rörelseresultat (EBIT), resultat efter finansiella poster
(EBT) och årets resultat (netresult) går via `src/main/services/result-service.ts`.
Ingen annan service duplicerar kontointervall-logik eller signMultiplier-mönster.
Dashboard, Tax, Opening Balance och Report är alla konsumenter.

### M97 (INCOME_STATEMENT_CONFIG som deklarativ källa)

`result-service` återanvänder `INCOME_STATEMENT_CONFIG` från `k2-mapping.ts`.
`validateResultConfigInvariants` körs vid modulladdning. Två oberoende
invariant-tester säkerställer identitet.

### M98 (account_number-comparator-förbud)

Inga lexikografiska kontointervall-jämförelser. All konto-intervallfiltrering
via `matchesRanges()` eller `CAST(SUBSTR(...) AS INTEGER) BETWEEN`.

### Relaterade M-regler

- **M101:** Atomär paid_amount + shared export queries
- **M119:** Ore-suffix obligatoriskt
- **M127:** ADD COLUMN-begränsningar vid schema-paritets-migrationer
- **M131:** Monetära beräkningar via heltalsaritmetik
- **M133:** axeCheck-regression-skydd

### Reserverat M-nummer

- **M134** — reserverad för S24b: "BR:s årets resultat beräknas via
  result-service (calculateResultSummary)"
