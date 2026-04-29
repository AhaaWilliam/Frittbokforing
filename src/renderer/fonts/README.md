# Fonts — Sprint 12

Variabla typsnitt bundlade lokalt. Appen ska fungera offline (ADR 001-anda),
så fontfilerna ligger i repo:t (inte CDN).

## Filer som förväntas finnas

`src/renderer/index.css` referererar tre filer i denna katalog:

| Filnamn | Källa | Licens |
|---|---|---|
| `Fraunces-VariableFont.woff2` | https://fonts.google.com/specimen/Fraunces | OFL 1.1 |
| `InterTight-VariableFont.woff2` | https://fonts.google.com/specimen/Inter+Tight | OFL 1.1 |
| `JetBrainsMono-VariableFont.woff2` | https://www.jetbrains.com/lp/mono/ | OFL 1.1 |

Alla tre är open source under SIL Open Font License 1.1 — får bundlas i
kommersiell programvara utan attribution-krav i UI (men licensfilerna ska
medfölja distributionen).

## Installation

1. Ladda ned variabel-versionerna (woff2-format) från respektive källa.
2. Spara med exakta filnamn enligt tabellen ovan i denna katalog.
3. Uppdatera `LICENSE-FONTS.txt` (i repo-roten) om filnamnen ändras.

Saknas filerna failar inte appen — `font-display: swap` faller tillbaka
på font-stacken definierad i `tokens.ts` (system-typsnitt). Tester ska
inte assertera mot exakt typsnitt; assertera mot generisk familj eller
beteende.

## Varför variabla typsnitt

Tre filer (en per familj) istället för 12+ statiska viktklasser. Mindre
bundle, full vikt-spektrum tillgängligt för Tailwind `font-weight-*`-
utilities, och lättare att underhålla.

## Sprint 12-status

Filerna är **inte committade** — de läggs till manuellt vid första
deploy. Sprint 12 levererar token-arkitekturen och `@font-face`-deklarationerna;
faktisk font-bundling sker när den första visuella migrationen i Sprint 13
behöver dem.

## Sprint 13 — verifiering

Lägg ett enkelt visuellt test som renderar `<p>Tjugo siffror: 1234567890</p>`
i alla tre familjer och tar screenshot. Om typsnitten faller tillbaka på
system blir testet ett tydligt "fonts saknas"-larm istället för silent
visual drift.
