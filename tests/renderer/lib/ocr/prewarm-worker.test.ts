/**
 * Sprint VS-145e — prewarmWorker singleton + best-effort.
 *
 * Verifierar:
 *  - prewarmWorker() resolverar utan fel även när Tesseract är mockad
 *  - Multipla anrop initierar workern bara EN gång (singleton-cache)
 *  - Worker-init-fel sväljs (resolverar void, inte rejectar)
 *
 * Notera: prewarmWorker har en NODE_ENV='test'-guard som no-op:ar i
 * test-miljö. Vi tar bort guarden för dessa tester genom att tillfälligt
 * sätta NODE_ENV='development' så vi faktiskt kan verifiera koden.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createWorkerMock = vi.fn()

vi.mock('tesseract.js', () => ({
  default: {
    createWorker: (...args: unknown[]) => createWorkerMock(...args),
  },
}))

const ORIGINAL_NODE_ENV = process.env.NODE_ENV

beforeEach(async () => {
  createWorkerMock.mockReset()
  // Lift NODE_ENV='test'-guard så prewarmWorker faktiskt kör.
  process.env.NODE_ENV = 'development'
  // Reset modul-cache så singleton-state nollställs mellan testen.
  vi.resetModules()
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

describe('Sprint VS-145e — prewarmWorker', () => {
  it('resolverar utan fel när Tesseract returnerar mockad worker', async () => {
    createWorkerMock.mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn(),
    })
    const { prewarmWorker } = await import(
      '../../../../src/renderer/lib/ocr/tesseract-worker'
    )
    await expect(prewarmWorker()).resolves.toBeUndefined()
    expect(createWorkerMock).toHaveBeenCalledTimes(1)
  })

  it('multipla prewarmWorker-anrop initierar workern bara EN gång', async () => {
    createWorkerMock.mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn(),
    })
    const { prewarmWorker } = await import(
      '../../../../src/renderer/lib/ocr/tesseract-worker'
    )
    await prewarmWorker()
    await prewarmWorker()
    await prewarmWorker()
    expect(createWorkerMock).toHaveBeenCalledTimes(1)
  })

  it('worker-init-fel sväljs (resolverar void, inte rejectar)', async () => {
    createWorkerMock.mockRejectedValue(new Error('boom'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { prewarmWorker } = await import(
      '../../../../src/renderer/lib/ocr/tesseract-worker'
    )
    await expect(prewarmWorker()).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('respekterar NODE_ENV=test-guarden (no-op + ingen createWorker-call)', async () => {
    process.env.NODE_ENV = 'test'
    createWorkerMock.mockResolvedValue({
      recognize: vi.fn(),
      terminate: vi.fn(),
    })
    const { prewarmWorker } = await import(
      '../../../../src/renderer/lib/ocr/tesseract-worker'
    )
    await expect(prewarmWorker()).resolves.toBeUndefined()
    expect(createWorkerMock).not.toHaveBeenCalled()
  })
})
