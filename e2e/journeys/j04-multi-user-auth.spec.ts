/**
 * J04 — Multi-user + auth (prompten-journey 5).
 *
 * Status: SKELETON / skip.
 *
 * Scope:
 *  - Skapa 3 användare via __test:createUser
 *  - Logga in A, skapa data, logga ut (eller låt auto-lock)
 *  - Logga in B, verifiera att A:s data är osynlig (separat K-nyckel)
 *  - Sätt auto-lock 60s, sleep 70s eller freezeClock forward, verifiera låst
 *  - Recovery-login: använd phrase från A:s createUser-returen
 *  - Verifiera samma data synlig efter recovery-login som efter vanlig
 *  - Försök "stjäla" B:s DB-fil som A — ska fela (fel K-nyckel → decrypt-error)
 *
 * Infrastruktur krävs:
 *  - __test:createUser + __test:loginUser med explicita secrets
 *  - __test:freezeClock för att simulera auto-lock-timeout utan real sleep
 *  - data-testid: user-switcher, lock-button, recovery-login-form
 */
import { test, expect } from '../app-fixture'

test.skip('J04 @pending — 3 användare, auto-lock, recovery, DB-isolation', async ({
  window,
}) => {
  expect(true).toBe(true)
  void window
})
