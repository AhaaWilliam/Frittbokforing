/**
 * E05 — Export end-to-end tests.
 *
 * Tests SIE4 and Excel export. Verifies files are written to E2E_DOWNLOAD_DIR.
 */
import { test, expect, takeScreenshot } from './app-fixture'
import { completeOnboarding, navigateTo } from './actions'
import fs from 'fs'
import path from 'path'

test.describe('E05 — Export', () => {
  test.beforeEach(async ({ window }) => {
    await completeOnboarding(window)
  })

  test('SIE4 export creates a file', async ({ window, downloadDir }) => {
    await navigateTo(window, 'export')

    // Click the SIE4 export button
    await window.click('button:has-text("SIE4")')
    await window.waitForTimeout(2_000)

    await takeScreenshot(window, 'e05-sie4-exported')

    // Verify a .se file was created in the download dir
    const files = fs.readdirSync(downloadDir)
    const sieFile = files.find((f) => f.endsWith('.se'))
    expect(sieFile).toBeTruthy()

    // Verify file has content
    const content = fs.readFileSync(
      path.join(downloadDir, sieFile!),
      'utf-8',
    )
    expect(content.length).toBeGreaterThan(0)
    expect(content).toContain('#FLAGGA')
  })

  test('Excel export creates a file', async ({ window, downloadDir }) => {
    await navigateTo(window, 'export')

    // Click the Excel export button
    await window.click('button:has-text("Excel")')
    await window.waitForTimeout(2_000)

    await takeScreenshot(window, 'e05-excel-exported')

    // Verify an .xlsx file was created
    const files = fs.readdirSync(downloadDir)
    const xlsxFile = files.find((f) => f.endsWith('.xlsx'))
    expect(xlsxFile).toBeTruthy()

    // Verify file is not empty
    const stats = fs.statSync(path.join(downloadDir, xlsxFile!))
    expect(stats.size).toBeGreaterThan(0)
  })
})
