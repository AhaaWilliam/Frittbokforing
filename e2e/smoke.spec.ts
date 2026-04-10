/**
 * Smoke tests — verify the Electron app launches and basic UI is present.
 * These run against the built app (dist/). Run `npm run build` first.
 */
import { test, expect, takeScreenshot } from './app-fixture'

test('app launches without crash', async ({ app, window }) => {
  // window fixture ensures firstWindow() has resolved
  const windows = app.windows()
  expect(windows.length).toBeGreaterThan(0)
})

test('window title is set', async ({ window }) => {
  const title = await window.title()
  expect(title.length).toBeGreaterThan(0)
})

test('root element renders in window', async ({ window }) => {
  const root = await window.$('#root')
  expect(root).not.toBeNull()
  await takeScreenshot(window, 'smoke-root')
})

test('app does not show a blank white screen', async ({ window }) => {
  const bodyText = await window.innerText('body')
  expect(bodyText.trim().length).toBeGreaterThan(0)
})

test('fresh DB shows onboarding wizard', async ({ window }) => {
  await window.waitForSelector('[data-testid="wizard"]', { timeout: 30_000 })
  const wizardVisible = await window.isVisible('[data-testid="wizard"]')
  expect(wizardVisible).toBe(true)
})
