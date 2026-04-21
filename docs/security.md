# Fritt Bokföring — säkerhetsöversikt

Offline-first desktop-app. Ingen molntjänst, ingen sync, ingen telemetri.
All data lever i krypterade filer per användare på lokal disk.

## Hotmodell

| Hot | Skydd |
|---|---|
| Förlorad laptop eller stöld | SQLCipher (AES-256) på alla user-DB:er. Utan lösenord eller recovery-key är data oläsbar. |
| Shoulder-surfing vid kort frånvaro | Auto-lock efter inaktivitet (default 15 min, justerbart 1–1440 min). |
| User-enumeration via timing | Konstant-tid dummy-argon2id körs vid `USER_NOT_FOUND` så svarstiden matchar riktig login. |
| Brute-force av lösenord | Rate-limiter med exponentiell backoff per user. Argon2id-KDF (64 MiB, t=3, p=4) gör offline-gissning dyr. |
| Glömt lösenord | 24-ords BIP-39 recovery-key (256 bit) genererad vid user-creation, kan roteras när användaren är inloggad. |
| Malware med filsystems-access | Mitigerat men inte eliminerat. Så länge appen är låst finns ingen klartext-nyckel i minnet. När olåst måste operativsystem-nivå-isolering + antivirus stå för resten. |
| Prompt-injection / XSS i renderer | Electron hardening: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All IPC går via preload + Zod-validerade scheman (regel 2–3 i CLAUDE.md). |
| SQL-injection | Allt går via `better-sqlite3`-prepared statements i main process. Renderer ser aldrig SQL (regel 1). |
| Supply-chain / malicious dep | Få externa beroenden, låsta via `package-lock.json`. Ingen telemetri eller eval av nedladdad kod. |

## Arkitektur

### Kryptering i vila

- Per-user SQLite-DB (`users/{userId}/app.db`) krypterad med SQLCipher
  (AES-256-CBC + HMAC-SHA-512 + page-baserad IV).
- DB-master-nyckel **K** (32 bytes slumpade) finns **aldrig i klartext på disk**.
  Två krypterade kopior (`passwordBlob` och `recoveryBlob`) lagras i
  `keys.json` — AES-256-GCM med separat KDF-salt per blob.
- KDF: Argon2id (OWASP 2024-rekommendation). Parametrar versionerade i
  `keys.json` för framtida uppgradering utan re-key av DB:n.
- Lösenordsbyte re-krypterar enbart `passwordBlob`. DB rörs inte.
- Recovery-key-byte kräver inloggning (K måste vara i minnet).

Se [ADR 004](adr/004-local-auth-sqlcipher.md) för full design-motivering.

### Autentiserings-flöde

1. App startar → LockScreen visar `users.json` (ingen decryption krävs för
   att lista användare).
2. Användaren väljer user → skriver lösenord → Argon2id-KDF → försök
   öppna `passwordBlob` med AES-GCM.
3. Vid success: K → `keyStore.unlock(userId, K)` → `db.ts` öppnar
   SQLCipher-DB med `PRAGMA key`.
4. K lever i RAM i main-process `KeyStore`. Renderer ser aldrig K —
   enda expose via IPC är `auth:status` som returnerar `{locked, userId, timeoutMs, msUntilLock}`.
5. Vid inaktivitet > `timeoutMs` eller explicit logout: K nollas
   (`buffer.fill(0)`), DB-handtag stängs.

### Session-hantering

- Varje IPC-anrop anropar inte automatiskt `touch()`. `auth:touch` är en
  explicit kanal som renderer kan anropa på meningsfull användaraktivitet.
- Renderer pollar `auth:status` var 30:e sekund (via
  [SessionTimeoutBadge](../src/renderer/components/layout/SessionTimeoutBadge.tsx))
  och visar varning när `msUntilLock < 5 min`. Pollen triggar inte touch
  — den observerar bara.
- Byte av användare = logout + reload (ingen multi-session per
  process). Knappen finns som "Byt användare" i sidebar-footer.

## Säkerhets-invarianter som enforcas i kod

- **Lösenord min 12 tecken** (`auth-service.validatePasswordStrength`).
  Hårdfail med `WEAK_PASSWORD` om kortare.
- **Master-nyckel lämnar aldrig main-process.** `KeyStore` exponerar
  `getKey()` enbart till `db.ts`, aldrig via IPC. Renderer har ingen
  väg att läsa K.
- **Recovery-key lagras aldrig efter rotation.** Den visas en gång i UI,
  sedan är det användarens ansvar att spara. Servern har inte kopia.
- **Backup-filer är också krypterade** (kopia av SQLCipher-DB).
- **Legacy-migration raderar okrypterad source** efter import (arkiveras
  till timestamped mapp som användaren ombeds radera).
- **IPC-input valideras med Zod** (regel 3). Ingen raw data från renderer
  når services utan schema-check.
- **Append-only bokföring** (regel 7, M140) gäller även för säkerhet:
  lösenordsbyte skapar inga journal entries; auth-events loggas inte i
  affärs-DB:n.

## Vad appen INTE gör

- **Ingen telemetri.** Inga utgående nätverksanrop från huvudappen.
  Enda undantag: explicit uppdaterings-check mot GitHub Releases
  (opt-out via setting).
- **Ingen molntjänst.** All data lever lokalt. Sync mellan enheter
  kräver manuell backup-export/import.
- **Ingen admin-kontoupprättelse.** Tappar du både lösenord och
  recovery-key → data är permanent förlorad. Det är med avsikt — det
  finns ingen master-key som Fritt eller Anthropic kan använda.
- **Ingen session i renderer.** Efter `location.reload()` vid logout
  återskapas all React-state från noll. Ingen in-memory läcka mellan
  användare i samma process-körning.

## Operativa rekommendationer

- **Backups:** kör regelbunden `backup:create` (bokförd i Settings).
  Backup-filer är SQLCipher-krypterade med samma K — de kräver alltså
  det användarkonto som genererade dem för att kunna öppnas.
- **Recovery-key:** skriv ner 24-ordsfrasen på papper vid first-run.
  Förvara separat från maskinen. Rotera om du misstänker att
  anteckningen läckt.
- **Lösenordshygien:** använd en lösenordshanterare. Minimum är 12
  tecken — praktiskt minimum för den typ av angriparscenario Argon2id
  skyddar mot ligger snarare runt 16 slumpade tecken.
- **Laptop-frånvaro:** sätt auto-lock till 5–10 min om du arbetar
  utanför hemmet/kontoret.

## Referenser

- [ADR 001 — SQLite-backend](adr/001-sqlite-backend.md)
- [ADR 004 — Lokal auth + SQLCipher](adr/004-local-auth-sqlcipher.md)
- [CLAUDE.md](../CLAUDE.md) regler 1–3 (Electron-säkerhet + IPC-validering)
- Källkod: [src/main/auth/](../src/main/auth/), [src/renderer/components/auth/](../src/renderer/components/auth/)
