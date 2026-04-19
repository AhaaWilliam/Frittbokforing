import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Settings-persistens i userData/fritt-settings.json.
 *
 * Sprint MC1: extraherad från ipc-handlers.ts så att services och utils
 * kan läsa active-company/active-fy utan att importera handler-modulen.
 */

export function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'fritt-settings.json')
}

export function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

export function saveSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2))
}
