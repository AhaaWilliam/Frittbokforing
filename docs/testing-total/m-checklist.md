# M-principer — testtäckning

Fyll i "tested" kolumnen under fas 3 (invariant-audit).
Format: ✅ direkt invariant-test, 🟡 indirekt (via funktionstest), ❌ ingen täckning.

| M   | Sektion / kort namn                                          | Tested | Fil                         |
|-----|--------------------------------------------------------------|--------|-----------------------------|
| M6  | Kronologisk serie (pre-M142 föregångare)                     | ?      |                             |
| M24 | paid_amount-pattern (pre-M101 föregångare)                   | ?      |                             |
| M63 | E2E dialog-bypass (pre-M147 föregångare)                     | ?      |                             |
| M66 | atomär paid_amount (pre-M101 föregångare)                    | ?      |                             |
| M92 | quantity × unit_price_ore formel                             | ?      |                             |
| M93 | closePeriod/reopenPeriod atomisk                             | ?      |                             |
| M94 | createNewFiscalYear inlinear close                           | ?      |                             |
| M95 | fiscal_year overlap-triggers                                 | ?      |                             |
| M96 | result-service som SoT                                        | ?      |                             |
| M97 | INCOME_STATEMENT_CONFIG invarianter                          | ?      |                             |
| M98 | inga lexikografiska konto-jämförelser                        | ?      |                             |
| M99 | öresutjämnings-villkor                                       | ?      |                             |
| M100| strukturerade valideringsfel {code,error,field}              | ?      |                             |
| M101| atomär paid_amount båda sidor + shared export                | ?      |                             |
| M102| isDirty ref-baserat + memo rad-callbacks                     | ?      |                             |
| M110| bank_fee_ore på payments                                     | ?      |                             |
| M111| bank-fee påverkar bank-rad, inte paid_amount                 | ?      |                             |
| M112| bulk-services publik + _Tx intern                            | ?      |                             |
| M113| bulk nested transactions som savepoints                      | ?      |                             |
| M114| batch bank-fee via source_type=auto_bank_fee                 | ?      |                             |
| M115| E2E via IPC-seeding, ej direkt DB                            | ?      |                             |
| M116| E2E = flöden, system-lager = affärslogik                     | ?      |                             |
| M117| data-testid whitelist                                        | ?      |                             |
| M118| opening_balance undantaget triggers 1–5                      | ?      |                             |
| M119| _ore-suffix på alla money-kolumner                           | ?      |                             |
| M120| company_id-denormalisering intentionell                      | ?      |                             |
| M121| table-recreate bevarar ej triggers                           | ?      |                             |
| M122| table-recreate-mönstret för inkommande FK                    | ?      |                             |
| M123| invoice_lines.account_number NULL by design                  | ?      |                             |
| M124| SQLITE_CONSTRAINT_UNIQUE-mappning                            | ?      |                             |
| M126| bank-fee-policy vid bulk                                     | ?      |                             |
| M127| ADD COLUMN-begränsning                                       | ?      |                             |
| M128| wrapIpcHandler-pattern                                       | ?      |                             |
| M129| form-totals separerad komponent                              | ?      |                             |
| M130| invoice quantity REAL, expense INTEGER                       | ?      |                             |
| M131| monetär aritmetik via heltal (money.ts)                      | ?      |                             |
| M132| shared constants för cross-schema                            | ?      |                             |
| M133| axe-regression-gate + M133-exempt                            | ?      |                             |
| M134| BR årets resultat via result-service                         | ?      |                             |
| M135| dual-impl paritet via delad fixture                          | ?      |                             |
| M136| _kr-suffix i renderer form-types                             | ?      |                             |
| M137| sign-flip-doktrin: belopp positiva                           | ?      |                             |
| M138| defense-in-depth för irreversibla relationer                 | ?      |                             |
| M139| cross-reference i description                                | ?      |                             |
| M140| korrigering en-gångs-lås                                     | ?      |                             |
| M141| cross-table trigger-inventering                              | ?      |                             |
| M142| chronology per serie                                         | ?      |                             |
| M143| FTS5 rebuild try-catch                                       | ?      |                             |
| M144| IpcResult-mandat för affärsdata-kanaler                      | ?      |                             |
| M145| SIE4-import I-serie                                          | ?      |                             |
| M146| polymorfa payment-batch-operationer                          | ?      |                             |
| M147| E2E dialog-bypass-varianter                                  | ?      |                             |
| M148| E2E-fixtures seedas via IPC                                  | ?      |                             |
| M150| deterministisk tid via getNow()                              | ?      |                             |
| M151| E-serie för avskrivningar                                    | ?      |                             |
| M152| signed amount i bank-extern rådata                           | ?      |                             |
| M153| deterministisk scoring                                       | ?      |                             |
| M154| unmatch via korrigeringsverifikat                            | ?      |                             |
| M155| asset-edit efter execution: pending-only                     | ?      |                             |
| M156| keyboard-nav kontrakt (skip-links, roving, dialog, Enter)    | ?      |                             |
| M157| combobox aria-activedescendant                               | ?      |                             |
| M158| stamdata scopas per bolag                                    | ?      |                             |
