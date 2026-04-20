# Auth flow — manuell smoke-test (macOS dev-build)

Skapat: Sprint U (2026-04-20).

## Syfte

Validera att ADR-004 auth-flödet (lokal login + SQLCipher + legacy-migration)
fungerar end-to-end i en riktig Electron-bygge på macOS. E2E-specerna
(`e11`, `e13`, `e15`, `auth-error-flows`) täcker kontraktet men inte
macOS-nativa bitar (Keychain, OS-focus, scroll-lock i lock-screen).

## Förutsättningar

```bash
npm rebuild better-sqlite3 better-sqlite3-multiple-ciphers  # för vitest
# ELLER
npx electron-rebuild -f -w better-sqlite3,better-sqlite3-multiple-ciphers  # för Electron
npm run build:main
```

Tumregel: efter growth av test-säkerhet eller om `npm run dev` kraschar
med `NODE_MODULE_VERSION`-fel → kör rebuilden för målet du tänker använda.

## Start

```bash
npm run dev
```

Väntar på `wait-on http://localhost:5173`, bygger main, electron-rebuildar
native modules, startar Electron i development mode.

## Checklista

### A. Första gången (tom user-vault)

- [ ] **A1.** App öppnas → LockScreen med "Skapa en ny användare:"-form syns
      direkt (empty users-lista auto-routes till create).
- [ ] **A2.** Fyll namn (≥1 char), lösen (≥12 char), bekräfta → "Skapa"-knapp
      blir klickbar.
- [ ] **A3.** Klick "Skapa" → recovery-key-skärm med 24 ord visas. Texten
      är synlig, monospace.
- [ ] **A4.** Bocka i "Jag har sparat återställningsfrasen" → "Fortsätt"-knapp
      blir klickbar.
- [ ] **A5.** Klick "Fortsätt" → LegacyPrompt visas OM
      `~/Documents/Fritt Bokföring/data.db` finns, annars direkt till AppShell.

### B. Legacy-migration (om legacy-DB finns)

- [ ] **B1.** "Importera befintlig data?"-dialog visas med arkivsökväg-info.
- [ ] **B2.** Klick "Importera" → "Importerar data…"-status visas kort.
- [ ] **B3.** "Import slutförd ✓"-skärm med arkiv-path visas.
- [ ] **B4.** Klick "Fortsätt" → AppShell laddas med importerad data synlig
      (företag, räkenskapsår, verifikationer).
- [ ] **B5.** `~/Documents/Fritt Bokföring/data.db` är flyttad till
      backups-mappen (inte raderad).

### C. Återkommande login

- [ ] **C1.** Logga ut → LockScreen visas med user i listan.
- [ ] **C2.** Klicka användaren → password-form visas.
- [ ] **C3.** Fel lösen → röd error "Fel lösenord" visas, kan försöka igen.
- [ ] **C4.** Rätt lösen → AppShell laddas, data intakt.
- [ ] **C5.** "Glömt lösen?" → recovery-form med 24-ord-fält.
- [ ] **C6.** Fel recovery → röd error.
- [ ] **C7.** Rätt recovery (24 ord från A3) → AppShell laddas.

### D. Rate-limit (efter 3+ felaktiga försök)

- [ ] **D1.** 3 fel lösen → nästa försök visar "För många försök — vänta Xs".
- [ ] **D2.** Vänta → backoff försvinner → rätt lösen funkar.

### E. Session-timeout / auto-lock

- [ ] **E1.** Inställning "Session-timeout" i Säkerhet-tab (default 15 min).
- [ ] **E2.** Minska till 1 min, vänta 70s → LockScreen auto-visas (no UI
      activity triggrar lock).
- [ ] **E3.** User-aktivitet (mouse/keyboard) inom fönstret resettar timern.

### F. User-management (Säkerhet-tab)

- [ ] **F1.** Byt lösen: gammalt + nytt + bekräfta → "Sparat" och logga ut +
      login med nytt funkar.
- [ ] **F2.** Byt namn → uppdaterat namn visas i LockScreen next time.
- [ ] **F3.** Rotera recovery-key → nya 24 ord visas, gamla fungerar inte
      längre.
- [ ] **F4.** Radera användare → bekräfta-dialog → raderas, LockScreen
      öppnas, user borta från listan.

### G. Multi-user

- [ ] **G1.** Skapa andra user i LockScreen ("Skapa ny användare"-knapp).
- [ ] **G2.** Båda users i listan efter logout.
- [ ] **G3.** User A loggar in → ser bara A:s data.
- [ ] **G4.** Logout + user B loggar in → ser bara B:s data (tom vid nyskapad).

## Negativa kontroller

- [ ] **N1.** Rätt password + krasch-pull av USB-kabel under login → app
      fungerar efter restart (vault-state persistent, key inte lagrad).
- [ ] **N2.** Modifiera vault-fil manuellt (lägg till byte) → login failar
      med "Ogiltig envelope" (argon2id-tag-check).
- [ ] **N3.** Radera vault-fil → listUsers tom → LockScreen auto-routes till
      create-form.

## Efter manuell test

Rapportera vilka steg som failade, screenshot av fel, console-log från
DevTools om möjligt. Appen körs i development mode — DevTools öppnas via
Cmd+Opt+I.

## Städa upp

```bash
# Dev-server körs i bakgrunden — stoppa med Ctrl+C i terminalfönstret,
# eller:
pkill -f "electron ."
pkill -f "vite"
```

User-data hamnar i `~/Library/Application Support/fritt-bokforing/` på
macOS. Radera mappen för att börja om från scratch.
