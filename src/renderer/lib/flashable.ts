/**
 * VS-45 — minimal flash-animation tracker.
 *
 * Mutations (saveDraft, finalize, etc.) markerar ID:t som "flashable"
 * vid success. Listrader läser via `consumeFlashable` på mount och
 * applicerar `fritt-flash`-klassen om matchen träffar (markeringen
 * förbrukas — flash sker bara ENA gången, även om listan re-renderar).
 *
 * Modulen är medvetet en module-level Map istället för React Context
 * eftersom mutations körs utanför React-trädet (useMutation.onSuccess).
 * En Map räcker för MVP — vi behöver inte broadcasta state-förändringar.
 *
 * Garbage collection: items som inte konsumeras inom 5s pruneras
 * vid varje access så Mapen inte växer obegränsat.
 */

type FlashKind = 'manualEntry' | 'invoice' | 'expense' | 'journal'

interface Entry {
  expiry: number // ms-timestamp då denna markering förfaller
}

const map = new Map<string, Entry>()
const TTL_MS = 5_000

function key(kind: FlashKind, id: number): string {
  return `${kind}:${id}`
}

function pruneExpired(now: number): void {
  for (const [k, v] of map) {
    if (v.expiry < now) map.delete(k)
  }
}

/**
 * Markera ett ID som flashable. Anropas från mutations onSuccess.
 * Förfaller automatiskt efter 5s om listan inte visas inom då.
 */
export function markFlashable(kind: FlashKind, id: number): void {
  const now = Date.now()
  pruneExpired(now)
  map.set(key(kind, id), { expiry: now + TTL_MS })
}

/**
 * Konsumerar markeringen — returnerar true om den fanns och tar bort
 * den. Avsedd att anropas vid radens första mount så animation körs
 * en (1) gång och inte upprepas vid re-render.
 */
export function consumeFlashable(kind: FlashKind, id: number): boolean {
  const k = key(kind, id)
  const entry = map.get(k)
  if (!entry) return false
  map.delete(k)
  return Date.now() < entry.expiry
}

/**
 * Test-utility: rensa alla markeringar.
 */
export function _resetFlashableForTests(): void {
  map.clear()
}
