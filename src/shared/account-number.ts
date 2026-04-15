/**
 * Numerisk jämförelsekomparator för BAS-kontonummer.
 * Löser F4 (M98): lexikografisk jämförelse bryter för 5-siffriga konton
 * ("30000" > "4000" lexikografiskt men < numeriskt).
 *
 * Förutsätter att input är validerade numeriska strängar (via Zod-schema).
 * Isomorphic: ingen Node-API-import, fungerar i både main och renderer.
 */
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
