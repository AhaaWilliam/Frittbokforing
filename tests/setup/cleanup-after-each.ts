/**
 * Sprint 93 — RTL cleanup-after-each för Stryker-renderer-config.
 *
 * vitest med `isolate: false` återanvänder modul-instanser och DOM mellan
 * testfiler. Utan explicit cleanup leakar React-trees → senare tester
 * ser flera kopior av samma komponent → false positives.
 *
 * Standard-vitest med isolate: true gör implicit cleanup. Vi behöver
 * detta enbart i Stryker-config där isolate: false är ett krav för att
 * undvika native-module-crash.
 */
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
