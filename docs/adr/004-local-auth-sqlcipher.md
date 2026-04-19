# ADR 004 — Lokal autentisering med SQLCipher-krypterad DB per användare

**Status:** Accepterad
**Datum:** 2026-04-19
**Kontext:** Användaren begär inloggningsskärm och datakryptering i vila.
Appen förblir offline-first (ingen moln-auth, ingen sync). Flera användare
per maskin krävs.

## Kontext

Fram till nu har appen använt en enda okrypterad `data.db` per maskin
(per ADR 001 via `better-sqlite3`). Data är skyddad endast av OS-
filbehörigheter. Detta är otillräckligt för:

- Flera användare per maskin (nuvarande modell: alla delar samma DB)
- Data i vila (förlorad laptop = full läsåtkomst)
- Revisor som arbetar med klientdata utan kryptering

Tre huvudalternativ övervägdes:

**(A) Lokalt konto med SQLCipher-kryptering** — nyckel härledd från
lösenord, per-user-DB på disk. Offline-first bevaras.

**(B) Moln-auth med server-sync** — Auth0/Clerk + backend-API + sync-
protokoll. Bryter ADR 001-antaganden (SQLite är lokal datakälla).
Månader av arbete, ny attack-yta (server, API, tokens).

**(C) OS-keychain för DB-nyckel, inget explicit lösenord** — "transparent"
kryptering utan login-UX. Ger data-at-rest men ingen multi-user, och
låser in oss på macOS Keychain / Windows DPAPI / libsecret.

## Beslut

**Alt A — lokalt konto med SQLCipher per användare, två-lagers-nyckelmodell,
BIP-39 recovery-key.** Bevarar ADR 001-antaganden om lokal SQLite och
offline-first drift.

## Designbeslut

### 1. Filstruktur

```
<userData>/fritt-bokforing/
  users.json              (index: {id, displayName, createdAt}[])
  users/
    {userId}/
      app.db              SQLCipher-krypterad, per-user
      keys.json           {passwordBlob, recoveryBlob, kdfParams, version}
      backups/
```

`users.json` innehåller **inga** credentials — bara display-metadata för
login-skärmen. Ingen läsning kräver decryption innan användaren valts.

### 2. Två-lagers-nyckelmodell

DB krypteras med en slumpad 256-bit **DB master-nyckel K** (genererad
av `crypto.randomBytes(32)` vid user-creation). K lagras aldrig i klartext.
Två krypterade kopior av K finns i `keys.json`:

- `passwordBlob = AES-256-GCM(K, kdf(password, salt_pw), iv_pw)`
- `recoveryBlob = AES-256-GCM(K, kdf(recoveryKey, salt_rk), iv_rk)`

Login: härled nyckel från lösenord, försök decryptera `passwordBlob`, få K,
öppna DB med `PRAGMA key = K`. Samma för recovery.

**Lösenordsändring:** re-krypterar `passwordBlob` med ny password-derived-
key. DB rörs inte (ingen `PRAGMA rekey` behövs).

**Recovery-key-ändring:** genererar ny recovery-key, re-krypterar
`recoveryBlob`. Kräver att användaren är inloggad (har K i minnet).

### 3. KDF: Argon2id via hash-wasm

Argon2id är OWASP-rekommenderat (2024) — memory-hard, GPU/ASIC-resistent.
Parametrar (tunable i `keys.json` per user för framtida uppgradering):

- Memory: 64 MiB
- Iterations (t): 3
- Parallelism (p): 4
- Output: 32 bytes
- Salt: 16 bytes random per blob

Varför **hash-wasm** (WASM) framför `argon2` (native):
- Ingen extra native dep att `electron-rebuild`:a (redan 2 native deps)
- Tillräckligt snabb — KDF körs en gång per login, inte per request
- Prestanda ~200ms på M1 MacBook med dessa parametrar (acceptabel login-latens)

### 4. Envelope-kryptering: AES-256-GCM via Node `crypto`

Node `crypto.createCipheriv('aes-256-gcm', ...)` är Electron-säker,
auth-tag för integrity, inga externa deps. 12-byte IV random per
envelope.

### 5. Recovery-key: BIP-39 24 ord (256 bits entropi)

Via `@scure/bip39` (auditerad, minimal, ingen native dep). 24 ord =
256 bits = matchar DB-master-key-storlek. Visas en gång vid user-
creation. Användaren måste bocka "sparad" innan continue.

Ingen annan recovery finns. Förlust av både lösenord och recovery-key =
data förlorad. Detta är explicit uttalat i CreateUserWizard och i
"glömt lösenord"-flödet.

### 6. SQLCipher-driver: `better-sqlite3-multiple-ciphers`

Drop-in-ersättare för `better-sqlite3`. API-kompatibel (samma
`db.transaction`, `db.prepare`, `db.pragma` etc.). Stödjer SQLCipher-4-
profil. POC (2026-04-19) verifierad på macOS Darwin 25.3.0:
- Rätt nyckel öppnar, fel nyckel ger `file is not a database`
- Filen innehåller inget plaintext (verifierat med byte-scan)
- `PRAGMA rekey` fungerar (används INTE i vår modell — vi rekryptarar envelope istället)
- `electron-rebuild` lyckas

Båda drivers samexisterar under migrationsfönstret. När alla imports är
flyttade tas gamla `better-sqlite3` bort.

### 7. Auto-lock och rate-limiting

- **Auto-lock:** default 15 min inaktivitet. Timer i main, reset på varje
  IPC-call. Vid lock: wipe K ur minnet, close DB handle, skicka
  `auth:locked`-event till renderer.
- **Rate-limiting:** exponentiell backoff per user-id, in-memory only
  (1s, 2s, 4s ... max 60s). Ingen persistens = inget DoS-vector mot
  egen data via corrupted lockout-fil. Efter 10 failed attempts
  inom 10 min: tvinga 60s cooldown.

### 8. Secure memory handling

- Lösenord tas emot som `string` via IPC, konverteras omedelbart till
  `Buffer`, zero:as med `.fill(0)` efter KDF.
- K hålls som `Buffer` i en singleton-modul (`key-store.ts`) i main.
  Aldrig exponerad via IPC. Renderer ser bara auth-status
  (locked/unlocked).
- V8 ger inga hårda garantier mot memory-dump, men `.fill(0)` + undvika
  string-concat i känsliga vägar minimerar residual-risk.

### 9. Migration från okrypterad DB

Befintliga installationer med `<Documents>/Fritt Bokföring/data.db`:
- Vid user-creation kollar LockScreen via `auth:legacy-check`
- Efter recovery-key-confirmation, om legacy finns → prompt "Importera?"
- Vid import (`auth:legacy-import`):
  - Stäng den tomma encrypted-DB (som skapades av createUser → openEncryptedDb)
  - Radera dess filer (inkl. WAL/SHM)
  - Migrera legacy → ny encrypted-DB via `migrateLegacyToEncrypted`
  - Återöppna via `openEncryptedDb` (migrations kör forward)
  - Arkivera legacy till `users/{id}/backups/pre-encryption-<ISO>-data.db`
- Vid skip (`auth:legacy-skip`): bara arkivera legacy (för att inte
  prompta igen nästa gång)
- Arkivet raderas aldrig automatiskt — användaren behåller full
  återställningsmöjlighet

**`sqlcipher_export` är inte tillgängligt:**
`better-sqlite3-multiple-ciphers` är INTE kompilerat med
`sqlcipher_export`-extensionen (verifierat 2026-04-19 via probe-script).
Standardmönstret `ATTACH ... + SELECT sqlcipher_export('encrypted')`
fungerar därför inte. Istället implementerar `migrateLegacyToEncrypted`
en **manuell schema- och data-kopia**:

1. Skapa fresh encrypted-DB (cipher + key + WAL)
2. `ATTACH legacy AS legacy KEY ''` (plaintext som attached)
3. Läs `sqlite_master`, sortera: tables → indexes → views → triggers
4. Exekvera CREATE TABLE-satserna på main
5. `INSERT INTO main.X SELECT * FROM legacy.X` per tabell
6. Exekvera CREATE-satserna för indexes/views/triggers (efter data)
7. Preservera `user_version` via `PRAGMA legacy.user_version`
8. DETACH + close

Pragma table-valued-variant `pragma_user_version('legacy')` stöds inte
i denna SQLite-build ("too many arguments on pragma_user_version() — max
0"). Schema-qualified `PRAGMA legacy.user_version` fungerar.

Target-filen får INTE existera vid anrop — kastar annars. Caller
ansvarar för att stänga och radera en ev. tidigare encrypted-DB (se
auth-handlers-flödet i `auth:legacy-import`).

### 10. E2E-testpåverkan

E2E-tester (M115, M148) seedar via IPC. Lägg till `E2E_TESTING=true`-
bypass i lock-screen: `__testApi.createAndLoginUser(name, password)` som
skippar recovery-key-wizard och loggar in direkt. Guardad av
`FRITT_TEST=1`.

## Alternativ som förkastades

- **OS keychain för nyckel (Alt C):** Låser in på plattform-specifika
  APIs, låter inte användaren ha flera konton, och ger svagare
  kontroll över nyckelns livscykel.
- **Moln-auth (Alt B):** Bryter ADR 001, kräver backend-infra, månader
  av arbete, helt ny attack-yta. Ej i scope för en offline-first app.
- **PBKDF2 istället för Argon2id:** Standardvalet för SQLCipher-4,
  men svagare mot dedikerad GPU/ASIC-attack. Marginell prestanda-vinst
  motiverar inte det säkerhetstappet.
- **scrypt istället för Argon2id:** Närmare Argon2id i styrka men
  Argon2id är nyare OWASP-konsensus (2024) och har bättre tunability.

## Konsekvenser

**Positiva:**
- Data-at-rest-kryptering — förlorad laptop ≠ dataläcka
- Multi-user stöd på samma maskin
- Recovery-key ger en chans även vid glömt lösenord
- ADR 001-antaganden (lokal SQLite, offline-first) bevaras
- SQLCipher är industristandard för krypterad SQLite

**Negativa / risker:**
- Ny attack-yta: KDF-implementation, memory-management av K, envelope-
  integrity
- Performance: +200ms login-latens (Argon2id). Bedöms acceptabel.
- Migration-fönster där gamla `better-sqlite3` och nya
  `better-sqlite3-multiple-ciphers` samexisterar
- Glömt lösenord + förlorad recovery = permanent dataförlust (kommuniceras
  tydligt i UX)

**Orörda invarianter:**
- Bokföringslogik (alla services, migrationer, regler 1–62)
- ADR 001 (better-sqlite3-kompatibilitet bevaras genom multi-ciphers-fork)
- ADR 002, ADR 003

## Verifiering

- Unit-tests för crypto.ts (KDF determinism, AES-GCM roundtrip, tamper-detection)
- Unit-tests för user-vault (skapa/lista/radera användare, keys.json-format)
- Integration-tests för db.ts (encrypted open, wrong key fail, rekey)
- E2E för lock-screen + login + auto-lock
- Manuell test: ta laptop, mounta disken i recovery-läge, verifiera att
  `app.db` inte innehåller klartext-SQL

## Referens

- POC: `scripts/poc-sqlcipher.mjs` (2026-04-19, all checks green)
- SQLCipher-4 spec: https://www.zetetic.net/sqlcipher/sqlcipher-api/
- OWASP Password Storage Cheat Sheet (Argon2id): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- `better-sqlite3-multiple-ciphers`: https://github.com/m4heshd/better-sqlite3-multiple-ciphers
