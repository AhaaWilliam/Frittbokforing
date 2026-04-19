/**
 * J01 — En månads bokföring (prompten-journey 1).
 *
 * Status: SKELETON / skip. Kräver Electron-runtime för körning.
 *
 * Scope:
 *  - Skapa bolag (onboarding)
 *  - 20 fakturor (10 olika kunder, olika moms)
 *  - 15 kostnader (10 leverantörer, 3 bankavgifter)
 *  - 3 bulk-betalningar
 *  - 1 kreditnota
 *  - 1 korrigeringsverifikat
 *  - Skapa momsrapport
 *  - Exportera SIE4
 *  - Verifiera: alla verifikat balanserar, BR/RR stämmer,
 *    SIE4-roundtrip ger samma data
 *
 * Task för uppföljning:
 *  - Använd window.__testApi.seedBulk för snabbare seeding vs UI-klick
 *  - SIE4-export via Settings → Export → välj mapp
 *  - Dialog-bypass via E2E_DOWNLOAD_DIR (M147)
 *  - Roundtrip-import via Settings → Import → välj fil (E2E_MOCK_OPEN_FILE)
 */
import { test, expect } from '../app-fixture'

test.skip('J01 @pending — en månads bokföring med roundtrip-SIE4', async ({
  window,
}) => {
  await window.waitForSelector('[data-testid="app-ready"]', {
    timeout: 30_000,
  })
  expect(true).toBe(true) // placeholder
  // TODO: implementera enligt scope ovan
})
