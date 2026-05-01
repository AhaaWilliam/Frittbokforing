import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  getE2EFilePath,
  getE2EMockOpenFile,
} from '../../src/main/utils/e2e-helpers'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-helpers-test-'))
  vi.stubEnv('E2E_DOWNLOAD_DIR', tmpDir)
  vi.stubEnv('E2E_TESTING', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getE2EFilePath (M63)', () => {
  it('save-mode skapar dir + returnerar path', () => {
    const sub = path.join(tmpDir, 'nested', 'dir')
    vi.stubEnv('E2E_DOWNLOAD_DIR', sub)
    const result = getE2EFilePath('export.sie')
    expect(result).toBe(path.join(sub, 'export.sie'))
    expect(fs.existsSync(sub)).toBe(true)
  })

  it('open-mode returnerar path om filen finns', () => {
    fs.writeFileSync(path.join(tmpDir, 'input.sie'), 'data')
    const result = getE2EFilePath('input.sie', 'open')
    expect(result).toBe(path.join(tmpDir, 'input.sie'))
  })

  it('open-mode returnerar null om filen saknas', () => {
    expect(getE2EFilePath('missing.sie', 'open')).toBeNull()
  })

  it('returnerar null när E2E_TESTING != true (production)', () => {
    vi.stubEnv('E2E_TESTING', 'false')
    expect(getE2EFilePath('x.sie')).toBeNull()
  })

  it('default-mode är save', () => {
    const result = getE2EFilePath('default.sie')
    expect(result).toBe(path.join(tmpDir, 'default.sie'))
  })

  it('default E2E_DOWNLOAD_DIR = /tmp/e2e-downloads om inte satt', () => {
    vi.stubEnv('E2E_DOWNLOAD_DIR', '')
    // Vi kan inte testa exakt path utan att skriva till /tmp; kontrollera
    // bara att det inte returnerar null
    const result = getE2EFilePath('test.sie')
    expect(result).toMatch(/test\.sie$/)
  })
})

describe('getE2EMockOpenFile', () => {
  it('returnerar null när E2E_TESTING != true', () => {
    vi.stubEnv('E2E_TESTING', 'false')
    vi.stubEnv('E2E_MOCK_OPEN_FILE', '/tmp/foo')
    expect(getE2EMockOpenFile()).toBeNull()
  })

  it('returnerar null när E2E_MOCK_OPEN_FILE inte är satt', () => {
    vi.stubEnv('E2E_MOCK_OPEN_FILE', '')
    expect(getE2EMockOpenFile()).toBeNull()
  })

  it('returnerar null när filen i envar:n saknas på disk', () => {
    vi.stubEnv('E2E_MOCK_OPEN_FILE', '/non/existent/path.sie')
    expect(getE2EMockOpenFile()).toBeNull()
  })

  it('returnerar path när filen finns', () => {
    const filePath = path.join(tmpDir, 'mock.sie')
    fs.writeFileSync(filePath, 'data')
    vi.stubEnv('E2E_MOCK_OPEN_FILE', filePath)
    expect(getE2EMockOpenFile()).toBe(filePath)
  })
})
