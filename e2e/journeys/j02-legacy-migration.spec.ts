/**
 * J02 — Legacy-migration (prompten-journey 3).
 *
 * Status: SKELETON / skip. Kräver Electron + pre-seeded legacy DB-fixture.
 *
 * Scope:
 *  - Fixture: okrypterad v47-DB på legacy-path (scripts/seed-legacy.mjs)
 *  - Starta app som ny användare via __test:createAndLoginUser
 *  - Klicka "Migrera gammal databas" i Settings / onboarding
 *  - Verifiera datarow-by-row: företag, fakturor, verifikationer
 *  - user_version efter migration = 47
 *  - SQLCipher aktivt (försök öppna utan nyckel → fel)
 *
 * Infrastruktur krävs:
 *  - scripts/seed-legacy-db.mjs — skapa okrypterad DB med representativ data
 *  - Fixture-paths: tests/fixtures/legacy/v47-unencrypted.db
 *  - __test:createAndLoginUser accepterar explicit password för tester
 */
import { test, expect } from '../app-fixture'

test.skip('J02 @pending — migrera okrypterad legacy-DB till krypterad', async ({
  window,
}) => {
  expect(true).toBe(true) // placeholder
  void window
  // TODO: pre-copy legacy fixture till E2E_USER_DATA, starta app, trigger migration
})
