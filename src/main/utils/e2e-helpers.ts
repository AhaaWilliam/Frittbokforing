import fs from 'fs'
import path from 'path'

/**
 * Returns a deterministic file path for E2E tests, bypassing native dialogs.
 * Returns null in production — caller should fall through to real dialog.
 *
 * mode 'save': creates dir and returns path to write to.
 * mode 'open': returns path to existing mock file (must exist in E2E_DOWNLOAD_DIR).
 *
 * Architecture principle M63.
 */
export function getE2EFilePath(
  defaultFilename: string,
  mode: 'save' | 'open' = 'save',
): string | null {
  if (process.env.E2E_TESTING !== 'true') return null
  const dir = process.env.E2E_DOWNLOAD_DIR || '/tmp/e2e-downloads'

  if (mode === 'save') {
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, defaultFilename)
  }

  // mode === 'open': mock file must exist
  const mockPath = path.join(dir, defaultFilename)
  return fs.existsSync(mockPath) ? mockPath : null
}

/**
 * Returns path set via E2E_MOCK_OPEN_FILE env var for open-dialog bypass
 * where the caller has no default filename (e.g. SIE4 import file picker).
 * Returns null in production or when not set.
 */
export function getE2EMockOpenFile(): string | null {
  if (process.env.E2E_TESTING !== 'true') return null
  const mockPath = process.env.E2E_MOCK_OPEN_FILE
  if (!mockPath) return null
  return fs.existsSync(mockPath) ? mockPath : null
}
