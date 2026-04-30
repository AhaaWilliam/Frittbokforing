# Fonts

Variabla typsnitt bundlas lokalt. Appen ska fungera offline (ADR 001-anda),
så fontfilerna ligger i repo:t (inte CDN).

## Filer som förväntas finnas

`src/renderer/index.css` deklarerar `@font-face` för tre filer i denna katalog:

| Filnamn | Källa | Licens |
|---|---|---|
| `Fraunces-VariableFont.woff2` | https://fonts.google.com/specimen/Fraunces | OFL 1.1 |
| `InterTight-VariableFont.woff2` | https://fonts.google.com/specimen/Inter+Tight | OFL 1.1 |
| `JetBrainsMono-VariableFont.woff2` | https://www.jetbrains.com/lp/mono/ | OFL 1.1 |

Alla tre är open source under SIL Open Font License 1.1 — får bundlas i
kommersiell programvara utan attribution-krav i UI. Licenstexten ligger
redan i `LICENSE-FONTS.txt` i repo-roten med per-font copyright-notiser.

## Installation (manuellt steg)

1. Öppna respektive specimen-sida ovan.
2. Klicka **Get font** → **Download all** för att få ett zip-paket.
3. Hitta variable-versionen i zip:en (filnamn liknar `Fraunces[SOFT,WONK,opsz,wght].ttf` eller motsvarande).
4. Konvertera till `.woff2` med exakt filnamn enligt tabellen ovan
   (t.ex. via [woff2 CLI](https://github.com/google/woff2) eller
   [convertio.co/ttf-woff2](https://convertio.co/ttf-woff2/)).
5. Spara filerna i denna katalog.
6. Verifiera: `npm run check:fonts` ska säga "OK (3/3 woff2-filer på plats)".

JetBrains Mono distribueras direkt som woff2 från GitHub-repot
([JetBrainsMono](https://github.com/JetBrains/JetBrainsMono/tree/master/fonts/webfonts))
— lättast att hämta därifrån.

## Filerna är inte committade

Fonterna ska committas till repo:t **när** de är hämtade. `.gitignore`
exkluderar dem inte. Tills dess fungerar appen via fallback-stacken
i `src/renderer/styles/tokens.ts`:

- Fraunces → Iowan Old Style → Apple Garamond → Georgia → serif
- Inter Tight → -apple-system → BlinkMacSystemFont → Segoe UI → Roboto → sans-serif
- JetBrains Mono → SF Mono → Menlo → Consolas → Liberation Mono → monospace

`font-display: swap` förhindrar "flash of invisible text".

## Build-tid-kontroll

`npm run build` kör automatiskt `scripts/check-fonts.mjs` (warn-only).
Saknade filer loggas men blockerar inte build:

```
[check-fonts] WARN: 3/3 font-fil(er) saknas i src/renderer/fonts/:
  - Fraunces-VariableFont.woff2
  - InterTight-VariableFont.woff2
  - JetBrainsMono-VariableFont.woff2
```

För release-build (`npm run dist`) körs `--strict`-mode som **failar**
build vid saknade filer. Detta säkerställer att skarpa releases inte
levereras med fallback-stacken aktiv.

## Varför variabla typsnitt

Tre filer (en per familj) istället för 12+ statiska viktklasser. Mindre
bundle, full vikt-spektrum tillgängligt för Tailwind `font-weight-*`-
utilities, och lättare att underhålla.

## Test

`tests/sprint-66-fonts.test.ts` vakter att @font-face-deklarationerna i
`index.css` fortsätter peka på exakt de filnamn som denna README listar.
Bryts paritet (t.ex. om någon byter URL till `Fraunces-Variable.woff2`)
failar testet med tydlig diff.
