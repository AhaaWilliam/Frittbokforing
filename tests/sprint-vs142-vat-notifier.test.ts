/**
 * Sprint VS-142 — vat-deadline-notifier (enhetstester).
 *
 * Verifierar:
 *   1. shouldNotify-eskaleringslogik (7/3/1) per nivå.
 *   2. Idempotens — samma nivå triggar inte två gånger.
 *   3. notifKey + findLastNotifiedLevel.
 *   4. buildNotificationContent — sv-SE-text med dag/dagar.
 */
import { describe, it, expect } from 'vitest'
import {
  shouldNotify,
  notifKey,
  findLastNotifiedLevel,
  buildNotificationContent,
} from '../src/main/services/vat-deadline-notifier'

describe('VS-142 shouldNotify — 7/3/1-eskalering', () => {
  it('inget när daysUntil > 7', () => {
    expect(shouldNotify({ daysUntil: 14, lastNotifiedLevel: null })).toEqual({
      trigger: false,
      level: null,
    })
    expect(shouldNotify({ daysUntil: 8, lastNotifiedLevel: null })).toEqual({
      trigger: false,
      level: null,
    })
  })

  it('triggar level 7 när daysUntil === 7 och inget tidigare', () => {
    const r = shouldNotify({ daysUntil: 7, lastNotifiedLevel: null })
    expect(r).toEqual({ trigger: true, level: 7 })
  })

  it('triggar level 7 i hela [4..7]-spannet om inget tidigare', () => {
    for (const d of [4, 5, 6, 7]) {
      const r = shouldNotify({ daysUntil: d, lastNotifiedLevel: null })
      expect(r).toEqual({ trigger: true, level: 7 })
    }
  })

  it('triggar inte level 7 igen om redan triggat', () => {
    const r = shouldNotify({ daysUntil: 5, lastNotifiedLevel: 7 })
    expect(r).toEqual({ trigger: false, level: null })
  })

  it('triggar level 3 när daysUntil === 3 och senast var 7', () => {
    const r = shouldNotify({ daysUntil: 3, lastNotifiedLevel: 7 })
    expect(r).toEqual({ trigger: true, level: 3 })
  })

  it('triggar level 3 även när inget tidigare triggats (hopp)', () => {
    // Edge case: app öppnades först nu (3 dagar kvar) — vi vill ändå
    // få en notifikation, inte vänta tills det blir 1 dag kvar.
    const r = shouldNotify({ daysUntil: 2, lastNotifiedLevel: null })
    expect(r).toEqual({ trigger: true, level: 3 })
  })

  it('triggar inte level 3 igen om redan triggat', () => {
    const r = shouldNotify({ daysUntil: 2, lastNotifiedLevel: 3 })
    expect(r).toEqual({ trigger: false, level: null })
  })

  it('triggar level 1 när daysUntil === 1', () => {
    const r = shouldNotify({ daysUntil: 1, lastNotifiedLevel: 3 })
    expect(r).toEqual({ trigger: true, level: 1 })
  })

  it('triggar level 1 vid 0 dagar (idag)', () => {
    const r = shouldNotify({ daysUntil: 0, lastNotifiedLevel: 3 })
    expect(r).toEqual({ trigger: true, level: 1 })
  })

  it('triggar level 1 vid passerad deadline (negativt)', () => {
    const r = shouldNotify({ daysUntil: -2, lastNotifiedLevel: 3 })
    expect(r).toEqual({ trigger: true, level: 1 })
  })

  it('triggar inte level 1 igen efter att redan ha triggats', () => {
    const r = shouldNotify({ daysUntil: -5, lastNotifiedLevel: 1 })
    expect(r).toEqual({ trigger: false, level: null })
  })

  it('hela eskaleringskedjan triggas i tur och ordning', () => {
    // Simulerar app som körs varje dag från day 7 till day 0
    let last: 7 | 3 | 1 | null = null
    const triggered: number[] = []
    for (let d = 7; d >= 0; d--) {
      const r = shouldNotify({ daysUntil: d, lastNotifiedLevel: last })
      if (r.trigger && r.level !== null) {
        triggered.push(r.level)
        last = r.level
      }
    }
    expect(triggered).toEqual([7, 3, 1])
  })
})

describe('VS-142 notifKey + findLastNotifiedLevel', () => {
  it('notifKey har stabilt format', () => {
    expect(notifKey(42, '2026-05-26', 7)).toBe('vat_notif_42_2026-05-26_7')
  })

  it('findLastNotifiedLevel returnerar null när inget triggat', () => {
    expect(findLastNotifiedLevel({}, 1, '2026-05-26')).toBeNull()
  })

  it('returnerar 7 när bara level 7 är markerad', () => {
    const settings = { 'vat_notif_1_2026-05-26_7': '1' }
    expect(findLastNotifiedLevel(settings, 1, '2026-05-26')).toBe(7)
  })

  it('returnerar mest akut nivå när flera markerade (1 < 3 < 7)', () => {
    const settings = {
      'vat_notif_1_2026-05-26_7': '1',
      'vat_notif_1_2026-05-26_3': '1',
    }
    expect(findLastNotifiedLevel(settings, 1, '2026-05-26')).toBe(3)
  })

  it('isolerar per bolag och deadline', () => {
    const settings = {
      'vat_notif_2_2026-05-26_1': '1',
    }
    // Annat bolag → null
    expect(findLastNotifiedLevel(settings, 1, '2026-05-26')).toBeNull()
    // Annat datum → null
    expect(findLastNotifiedLevel(settings, 2, '2026-08-26')).toBeNull()
    // Match → 1
    expect(findLastNotifiedLevel(settings, 2, '2026-05-26')).toBe(1)
  })
})

describe('VS-142 buildNotificationContent', () => {
  it('singularis "dag" vid 1 dag', () => {
    const c = buildNotificationContent({
      companyId: 1,
      companyName: 'Acme AB',
      deadlineIso: '2026-05-26',
      daysUntil: 1,
      level: 1,
      periodLabel: 'mars 2026',
    })
    expect(c.title).toContain('1 dag —')
    expect(c.title).not.toContain('1 dagar')
    expect(c.title).toContain('Acme AB')
    expect(c.body).toContain('mars 2026')
    expect(c.body).toContain('2026-05-26')
  })

  it('plural "dagar" vid 7 dagar', () => {
    const c = buildNotificationContent({
      companyId: 1,
      companyName: 'Acme AB',
      deadlineIso: '2026-05-26',
      daysUntil: 7,
      level: 7,
      periodLabel: 'mars 2026',
    })
    expect(c.title).toContain('7 dagar')
  })

  it('passerad deadline har egen titel', () => {
    const c = buildNotificationContent({
      companyId: 1,
      companyName: 'Acme AB',
      deadlineIso: '2026-05-26',
      daysUntil: -3,
      level: 1,
      periodLabel: 'mars 2026',
    })
    expect(c.title).toContain('passerat')
    expect(c.title).toContain('Acme AB')
  })
})
