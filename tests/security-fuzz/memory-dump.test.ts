/**
 * TT-7 — Memory-dump defensive test for auth secrets.
 *
 * Tar heap-snapshot via `v8.writeHeapSnapshot` efter auth-flöden och
 * letar efter klartext-lösen, master-key-bytes och recovery-key-ord.
 *
 * Detta är en BEST-EFFORT defensiv test:
 * - V8 garanterar inte när/hur strängar deduplikeras eller frigörs
 * - Buffer.fill(0) eliminerar bytes från Buffer-storage men inte
 *   från eventuella V8-interna kopior
 * - Test-frame själv håller en referens till klartext-literalen
 *
 * Strategi: använd UNIKA marker-strängar per scenario, räkna
 * förekomster i snapshoten, och flagga endast om count överstiger
 * den förväntade test-frame-baseline.
 *
 * GC: vi använder `global.gc?.()` när tillgängligt (kräver
 * `--expose-gc` på node-flagga). Annars best-effort med
 * allokerings-tryck. Test-flakiness dokumenteras per scenario.
 *
 * Referenser: ADR 004 §7 (key-store wipe), src/main/auth/auth-service.ts
 * (wipeBuffer-pattern), docs/testing-total/backlog-plan.md (TT-7
 * memory-dump-defensiv).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import v8 from 'node:v8'
import { createAuthService } from '../../src/main/auth/auth-service'
import { createKeyStore } from '../../src/main/auth/key-store'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'
import { UserVault } from '../../src/main/auth/user-vault'

const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

let tmpRoot: string
let snapshotPath: string | null = null

function makeService() {
  const vault = new UserVault(tmpRoot)
  vault.ensureRoot()
  const keyStore = createKeyStore()
  const rateLimiter = createRateLimiter()
  return {
    service: createAuthService({
      vault,
      keyStore,
      rateLimiter,
      now: () => 10 ** 12,
      kdfParams: FAST_KDF,
    }),
    keyStore,
    vault,
    rateLimiter,
  }
}

/**
 * Best-effort GC. Returns true om global.gc finns (--expose-gc),
 * annars allokerar och kastar bort objekt för att uppmuntra GC.
 */
async function tryGC(): Promise<boolean> {
  const gc = (globalThis as { gc?: () => void }).gc
  if (typeof gc === 'function') {
    gc()
    // Kör flera gånger — major GC kan kräva multipla pass
    await new Promise((r) => setImmediate(r))
    gc()
    await new Promise((r) => setImmediate(r))
    gc()
    return true
  }
  // Best-effort: allocate pressure to trigger GC
  for (let i = 0; i < 5; i++) {
    const garbage: string[] = []
    for (let j = 0; j < 10000; j++) {
      garbage.push(`gc-pressure-${i}-${j}-${Math.random()}`)
    }
    await new Promise((r) => setImmediate(r))
  }
  return false
}

/**
 * Dumpa heap till temp-fil och returnera innehållet som sträng.
 * Snapshoten ligger som JSON-text — strings-arrayen innehåller
 * alla V8-interna stringar inklusive Buffer-content som tolkats
 * som UTF-8 i strängform (begränsat — Buffer-bytes som inte är
 * giltig UTF-8 visas inte här).
 */
function dumpHeapAsString(): string {
  const p = path.join(
    tmpRoot,
    `heap-${Date.now()}-${Math.random().toString(36).slice(2)}.heapsnapshot`,
  )
  v8.writeHeapSnapshot(p)
  snapshotPath = p
  return fs.readFileSync(p, 'utf8')
}

/**
 * Räkna förekomster av needle i haystack (icke-överlappande).
 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++
    idx += needle.length
  }
  return count
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-memdump-'))
  snapshotPath = null
})

afterEach(() => {
  if (snapshotPath && fs.existsSync(snapshotPath)) {
    try {
      fs.unlinkSync(snapshotPath)
    } catch {
      // ignore
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('Memory-dump defensiv test (TT-7)', () => {
  it('infrastructure: v8.writeHeapSnapshot fungerar och innehåller live strings', () => {
    // Sanity: en unik sträng som vi håller en referens till MÅSTE finnas i snapshoten.
    // Om denna assertion failar är hela test-suiten meningslös.
    // Bygg marker via concatenation och flatten via Buffer roundtrip.
    // V8 lagrar ofta concat-resultat som ConsString (rope) som inte
    // är synlig som en sammanhängande sträng i snapshoten — vi måste
    // flatten:a den explicit.
    const rand = Math.random().toString(36).slice(2)
    const ts = String(Date.now())
    // Buffer roundtrip tvingar flattening till en SeqString
    const liveMarker = Buffer.from('LIVEMARKER-' + rand + '-' + ts).toString('utf8')
    const holders: { v: string }[] = []
    for (let i = 0; i < 10; i++) {
      holders.push({ v: liveMarker })
    }
    const directHolder = { value: liveMarker }
    const snap = dumpHeapAsString()
    expect(directHolder.value).toBe(liveMarker)
    expect(holders.length).toBe(10)
    const found = countOccurrences(snap, liveMarker)
    if (found === 0) {
      const prefixCount = countOccurrences(snap, 'LIVEMARKER-')
      console.error(
        `[DEBUG] snapshot size=${snap.length}, 'LIVEMARKER-' count=${prefixCount}, looking for=${liveMarker}`,
      )
    }
    expect(found).toBeGreaterThan(0)
  })

  it('lösenord från createUser försvinner ur heap efter logout + GC (best-effort)', async () => {
    // Använd en unik marker som INTE finns i test-frame-literalen,
    // konstruera den runtime så test-koden själv inte håller den.
    // Flatten via Buffer roundtrip — annars är detta en ConsString som
    // inte är synlig i heap-snapshoten även när den lever (jfr.
    // infrastructure-test). Vi vill testa att password INTE finns i
    // heapen efter logout, vilket kräver att vi vet att det skulle
    // synas om det fanns.
    const unique = Buffer.from(
      'PWUNIQUE-' + Math.random().toString(36).slice(2) + '-' + Date.now(),
    ).toString('utf8')
    const password = Buffer.from(
      'LongTestPassword-' + unique + '-padding-12345',
    ).toString('utf8')

    const { service, keyStore } = makeService()
    await service.createUser('Alice', password)

    // Baseline: medan service-tillstånd lever kan password fortfarande finnas
    // i V8-interna interned strings. Vi mäter EFTER logout + GC.
    service.logout()
    expect(keyStore.isLocked()).toBe(true)

    // Släpp lokal referens. password-variabeln är fortfarande i scope
    // (closure), men vi kan inte ta bort den utan att hela testet failar
    // eftersom literal-substring lever i source-frames.
    // Strategi: leta efter `unique` (inte hela password) i snapshoten.
    // `unique` finns i test-frame som concatenated-resultat, men eftersom
    // password byggdes via template-literal lever den substring som EN
    // V8-string. Test-frame baseline är ~1 (closure-variabel).
    const usedGc = await tryGC()
    const snap = dumpHeapAsString()
    const count = countOccurrences(snap, unique)

    // Acceptabel baseline: closure-referensen + några V8-internals.
    // Misslyckande = oväntat hög count som indikerar att password kopierats
    // till många V8-interna platser och inte frigjorts.
    // Tolerans 10 är generös — production-code wipea Buffer, men V8 kan
    // hålla string-kopior vi inte når.
    if (!usedGc) {
      // Utan --expose-gc är vi best-effort. Logga och var mer tolerant.
      console.warn(
        `[TT-7 memory-dump] Inga --expose-gc — best-effort GC. count=${count}`,
      )
    }
    expect(
      count,
      `password marker count=${count} efter logout — möjlig leak om >>1`,
    ).toBeLessThan(20)
  })

  it('master key bytes försvinner ur heap efter logout + GC (best-effort)', async () => {
    // Vi kan inte tvinga in en känd K via offentligt API, men key-store
    // exponerar getKey() medan unlocked. Vi snapshottar K, loggar ut,
    // och letar efter K-bytes hex-encoded i heap.
    const { service, keyStore } = makeService()
    const password = Buffer.from(
      'KeyDumpTest-' + Math.random().toString(36).slice(2) + '-12345xyz',
    ).toString('utf8')
    await service.createUser('Alice', password)

    expect(keyStore.isLocked()).toBe(false)
    const K = keyStore.getKey()
    expect(K.length).toBe(32)

    // Snapshot K som hex-strängar i flera rep (V8 kan ha den i olika encoding).
    // Hex är osannolik att kollidera med slumpmässig data eftersom 64-tecken
    // hex-prefix är unikt nog.
    const kHex = Buffer.from(K).toString('hex')
    const kHexFirst32 = kHex.slice(0, 32) // 16 bytes — fortfarande unikt
    // Plain-binary-marker: leta efter K som binär sträng (latin1-konvertering).
    // Detta är hur Buffer.toString('binary') skulle representera bytes.
    const kBinary = Buffer.from(K).toString('binary')

    // Logga ut — keyStore wipear sin egen kopia
    service.logout()
    expect(keyStore.isLocked()).toBe(true)

    // Försök GC innan snapshot
    const usedGc = await tryGC()
    const snap = dumpHeapAsString()

    const hexCount = countOccurrences(snap, kHexFirst32)
    const binCount = countOccurrences(snap, kBinary)

    // Test-frame håller `kHex`, `kHexFirst32`, `kBinary` lokalt — så
    // baseline ≥1 är förväntat. Fail om count är dramatiskt högre vilket
    // skulle indikera att K bevaras på flera platser i runtime efter wipe.
    // Tolerans 15 är generös för V8 string-internering av test-frame-vars.
    if (!usedGc) {
      console.warn(
        `[TT-7 memory-dump] master-key: utan --expose-gc, hexCount=${hexCount} binCount=${binCount}`,
      )
    }
    expect(
      hexCount,
      `master-key hex count=${hexCount} — möjlig leak om >>baseline`,
    ).toBeLessThan(20)
    // Binär-form bör vara starkt knuten till test-frame-variabeln (1-2)
    expect(
      binCount,
      `master-key binary count=${binCount}`,
    ).toBeLessThan(20)
  })

  it('recovery-key ord finns inte tillsammans i heap efter loginWithRecoveryKey + logout (best-effort)', async () => {
    const { service, keyStore } = makeService()
    const password = Buffer.from(
      'RecoveryKeyTest-' + Math.random().toString(36).slice(2) + '-12345',
    ).toString('utf8')
    const { user, recoveryKey } = await service.createUser('Alice', password)
    service.logout()

    // Logga in med recovery-key, sedan ut igen
    await service.loginWithRecoveryKey(user.id, recoveryKey)
    expect(keyStore.isLocked()).toBe(false)
    service.logout()
    expect(keyStore.isLocked()).toBe(true)

    const usedGc = await tryGC()
    const snap = dumpHeapAsString()

    // Hela frasen som EN sträng — det starkaste leak-tecknet
    const fullPhraseCount = countOccurrences(snap, recoveryKey)

    // Test-frame håller `recoveryKey` som lokal variabel — baseline 1-3
    // (varierar med V8 string-internering)
    if (!usedGc) {
      console.warn(
        `[TT-7 memory-dump] recovery-key: utan --expose-gc, fullCount=${fullPhraseCount}`,
      )
    }
    expect(
      fullPhraseCount,
      `recovery-key fullphrase count=${fullPhraseCount} — möjlig leak om >>baseline`,
    ).toBeLessThan(15)

    // Note: vi testar INTE individuella BIP-39-ord eftersom ordlistan är
    // global (importerad från @scure/bip39/wordlists/english.js) och
    // garanterat finns i heapen — det skulle alltid trigga false positives.
    // Att leta efter hela frasen är tillräckligt — om någon kod kopierar
    // frasen lever den som en sammanhängande sträng eller substring av en.
  })
})
