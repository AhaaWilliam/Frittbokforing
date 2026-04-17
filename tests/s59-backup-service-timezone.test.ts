// Force Stockholm timezone so the test proves the bug regardless of host TZ
process.env.TZ = 'Europe/Stockholm'

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// Mock electron and e2e-helpers before importing
vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
    getAllWindows: () => [{}],
  },
  app: {
    relaunch: vi.fn(),
    exit: vi.fn(),
  },
}))

vi.mock('../src/main/utils/e2e-helpers', () => ({
  getE2EFilePath: () => null,
}))

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('../src/main/db', () => ({
  closeDb: vi.fn(),
  getDbPath: () => '/tmp/mock-db-path.db',
}))

import { dialog } from 'electron'
import { createBackup } from '../src/main/services/backup-service'

describe('S59 F9 — timezone regression: backup-service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2026-04-12T22:30:00Z = 2026-04-13T00:30:00 CEST (Stockholm)
    vi.setSystemTime(new Date('2026-04-12T22:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('backup filename uses local date, not UTC', async () => {
    const mockShowSaveDialog = vi.mocked(dialog.showSaveDialog)
    mockShowSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })

    const mockDb = { backup: vi.fn() } as any
    await createBackup(mockDb)

    expect(mockShowSaveDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultPath: 'fritt-bokforing-backup-2026-04-13.db',
      }),
    )
    // Must NOT contain 2026-04-12 (the UTC date / "yesterday")
    const callArgs = mockShowSaveDialog.mock.calls[0] as unknown as [
      unknown,
      { defaultPath: string },
    ]
    expect(callArgs[1].defaultPath).not.toContain('2026-04-12')
  })
})
