import { describe, it, expect, beforeEach } from 'vitest'
import { createKeyStore, type KeyStore } from '../../src/main/auth/key-store'

// Fake scheduler — lets tests advance time deterministically.
class FakeScheduler {
  private handles = new Map<number, { fn: () => void; fireAt: number }>()
  private nextId = 1
  private now = 0

  setTimer = (fn: () => void, ms: number): number => {
    const id = this.nextId++
    this.handles.set(id, { fn, fireAt: this.now + ms })
    return id
  }

  clearTimer = (h: unknown): void => {
    this.handles.delete(h as number)
  }

  advance(ms: number): void {
    this.now += ms
    // Fire in order of fireAt; snapshot since firing may add new timers.
    const fired = [...this.handles.entries()]
      .filter(([, t]) => t.fireAt <= this.now)
      .sort((a, b) => a[1].fireAt - b[1].fireAt)
    for (const [id, t] of fired) {
      this.handles.delete(id)
      t.fn()
    }
  }

  pendingCount(): number {
    return this.handles.size
  }
}

let sched: FakeScheduler
let store: KeyStore

beforeEach(() => {
  sched = new FakeScheduler()
  store = createKeyStore({
    timeoutMs: 1000,
    setTimer: sched.setTimer,
    clearTimer: sched.clearTimer,
  })
})

describe('key-store — initial state', () => {
  it('starts locked', () => {
    expect(store.isLocked()).toBe(true)
  })

  it('getUserId returns null when locked', () => {
    expect(store.getUserId()).toBeNull()
  })

  it('getKey throws when locked', () => {
    expect(() => store.getKey()).toThrow(/locked/)
  })
})

describe('key-store — unlock', () => {
  it('unlock stores userId + key (copied)', () => {
    const K = Buffer.alloc(32, 0x42)
    store.unlock('u1', K)
    expect(store.isLocked()).toBe(false)
    expect(store.getUserId()).toBe('u1')
    expect(store.getKey().equals(K)).toBe(true)
  })

  it('unlock copies the key (wiping caller buffer does not affect store)', () => {
    const K = Buffer.alloc(32, 0x42)
    store.unlock('u1', K)
    K.fill(0)
    const stored = store.getKey()
    expect(stored.equals(Buffer.alloc(32, 0x42))).toBe(true)
  })

  it('rejects keys of wrong size', () => {
    expect(() => store.unlock('u1', Buffer.alloc(16))).toThrow(
      /32 bytes/,
    )
  })
})

describe('key-store — explicit lock', () => {
  it('lock() zeros state and returns to locked', () => {
    store.unlock('u1', Buffer.alloc(32, 0x42))
    store.lock()
    expect(store.isLocked()).toBe(true)
    expect(store.getUserId()).toBeNull()
  })

  it('lock() fires onLock listeners', () => {
    let fired = 0
    store.onLock(() => {
      fired++
    })
    store.unlock('u1', Buffer.alloc(32, 0x42))
    store.lock()
    expect(fired).toBe(1)
  })

  it('unsubscribe stops listener', () => {
    let fired = 0
    const off = store.onLock(() => {
      fired++
    })
    off()
    store.unlock('u1', Buffer.alloc(32, 0x42))
    store.lock()
    expect(fired).toBe(0)
  })

  it('listener throwing does not break subsequent listeners', () => {
    const order: string[] = []
    store.onLock(() => {
      order.push('a')
      throw new Error('boom')
    })
    store.onLock(() => {
      order.push('b')
    })
    store.unlock('u1', Buffer.alloc(32, 0x42))
    store.lock()
    expect(order).toEqual(['a', 'b'])
  })
})

describe('key-store — auto-lock via inactivity timer', () => {
  it('locks after timeout elapses with no touch', () => {
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(999)
    expect(store.isLocked()).toBe(false)
    sched.advance(2)
    expect(store.isLocked()).toBe(true)
  })

  it('touch() resets the timer', () => {
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(500)
    store.touch()
    sched.advance(700)
    expect(store.isLocked()).toBe(false) // would have fired without touch
    sched.advance(400)
    expect(store.isLocked()).toBe(true)
  })

  it('touch() is a no-op when locked', () => {
    store.touch()
    expect(store.isLocked()).toBe(true)
    expect(sched.pendingCount()).toBe(0)
  })

  it('auto-lock fires onLock listeners', () => {
    let fired = 0
    store.onLock(() => {
      fired++
    })
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(2000)
    expect(fired).toBe(1)
  })

  it('unlocking again after auto-lock works', () => {
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(2000)
    expect(store.isLocked()).toBe(true)
    store.unlock('u2', Buffer.alloc(32, 0x11))
    expect(store.isLocked()).toBe(false)
    expect(store.getUserId()).toBe('u2')
  })
})

describe('key-store — timeout setter', () => {
  it('setTimeoutMs updates the timeout, takes effect on next arm', () => {
    store.setTimeoutMs(5000)
    expect(store.getTimeoutMs()).toBe(5000)
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(4000)
    expect(store.isLocked()).toBe(false)
    sched.advance(1500)
    expect(store.isLocked()).toBe(true)
  })

  it('setTimeoutMs re-arms timer when unlocked', () => {
    store.unlock('u1', Buffer.alloc(32, 0x42))
    sched.advance(500)
    store.setTimeoutMs(10_000)
    sched.advance(1_000) // would have fired under old 1s timeout
    expect(store.isLocked()).toBe(false)
  })

  it('rejects non-positive timeout', () => {
    expect(() => store.setTimeoutMs(0)).toThrow(/> 0/)
    expect(() => store.setTimeoutMs(-100)).toThrow(/> 0/)
  })
})

describe('key-store — unlock replaces prior key', () => {
  it('unlock while unlocked zeros old key and stores new', () => {
    store.unlock('u1', Buffer.alloc(32, 0x11))
    store.unlock('u2', Buffer.alloc(32, 0x22))
    expect(store.getUserId()).toBe('u2')
    expect(store.getKey().equals(Buffer.alloc(32, 0x22))).toBe(true)
  })
})
