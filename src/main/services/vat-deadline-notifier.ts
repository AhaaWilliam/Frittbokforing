/**
 * Sprint VS-142 — VAT-deadline-notifier.
 *
 * Triggas vid app.whenReady() (efter att DB är öppnad). Itererar bolag som
 * har `notify_vat_deadline=1`, beräknar nästa moms-deadline (VS-115b/129),
 * och dispatchar OS-notifikation om deadline ligger inom 7/3/1 dagar och
 * den nivån inte redan har triggats för aktuell deadline.
 *
 * Idempotens: settings-key `vat_notif_<companyId>_<isoDate>_<level>` sätts
 * till `'1'` efter att en notifikation skickats. Eskalerande trigger:
 * level 7 triggas en gång, level 3 en gång, level 1 en gång — totalt
 * tre notifikationer per deadline.
 *
 * `shouldNotify` är ren och separat-testbar. `runVatDeadlineCheck` har
 * sido-effekter (settings + webContents.send) och hanterar fel best-effort
 * — ett fel för ett bolag stoppar inte de andra.
 */

import type Database from 'better-sqlite3'
import type { BrowserWindow } from 'electron'
import log from 'electron-log/main'
import {
  computeVatDeadline,
  type VatFrequency,
} from '../../shared/vat-deadline'
import { listCompanies } from './company-service'
import { loadSettings, saveSettings } from '../utils/settings'
import { todayLocalFromNow } from '../utils/now'

export type VatNotifyLevel = 7 | 3 | 1

const LEVELS: VatNotifyLevel[] = [7, 3, 1]

export interface ShouldNotifyInput {
  /** Antal dagar kvar till deadline (kan vara negativt). */
  daysUntil: number
  /** Senaste nivån som notifierats för aktuell deadline (eller null). */
  lastNotifiedLevel: VatNotifyLevel | null
}

export interface ShouldNotifyResult {
  trigger: boolean
  level: VatNotifyLevel | null
}

/**
 * Avgör om en notifikation ska triggas baserat på `daysUntil` och senaste
 * notifierade nivån. Returnerar den lägsta level <= daysUntil som ännu
 * inte triggats.
 *
 * Regler:
 *   - daysUntil > 7  → ingen trigger
 *   - daysUntil i [4..7] och lastNotifiedLevel != 7 → trigger level 7
 *   - daysUntil i [2..3] och lastNotifiedLevel inte 3 eller 1 → trigger 3
 *   - daysUntil <= 1 och lastNotifiedLevel != 1 → trigger 1
 *   - daysUntil < 0 (passerat) → trigger 1 om inte redan triggat
 */
export function shouldNotify(input: ShouldNotifyInput): ShouldNotifyResult {
  const { daysUntil, lastNotifiedLevel } = input
  // Bestäm vilken nivå daysUntil "kvalificerar" för: lägsta level <= daysUntil
  // (för deadline som passerats används level 1).
  let qualifiesFor: VatNotifyLevel | null = null
  if (daysUntil <= 1) qualifiesFor = 1
  else if (daysUntil <= 3) qualifiesFor = 3
  else if (daysUntil <= 7) qualifiesFor = 7

  if (qualifiesFor === null) return { trigger: false, level: null }

  // Eskaleringsordning: 7 → 3 → 1. Ranking där lägre level = mer akut.
  const lastRank = lastNotifiedLevel === null ? 99 : lastNotifiedLevel
  if (qualifiesFor < lastRank) {
    return { trigger: true, level: qualifiesFor }
  }
  return { trigger: false, level: null }
}

/**
 * Bygger settings-keyn för en specifik bolag/deadline/nivå.
 */
export function notifKey(
  companyId: number,
  deadlineIso: string,
  level: VatNotifyLevel,
): string {
  return `vat_notif_${companyId}_${deadlineIso}_${level}`
}

/**
 * Slår ihop alla settings-keys för en bolag/deadline och returnerar den
 * högsta nivån som markerats som notifierad. (7 = lägst akut, 1 = mest
 * akut). Returnerar `null` om ingen ännu triggats.
 */
export function findLastNotifiedLevel(
  settings: Record<string, unknown>,
  companyId: number,
  deadlineIso: string,
): VatNotifyLevel | null {
  let last: VatNotifyLevel | null = null
  for (const lvl of LEVELS) {
    if (settings[notifKey(companyId, deadlineIso, lvl)] === '1') {
      // Mest akut (lägst tal) vinner
      if (last === null || lvl < last) last = lvl
    }
  }
  return last
}

export interface VatNotificationPayload {
  companyId: number
  companyName: string
  deadlineIso: string
  daysUntil: number
  level: VatNotifyLevel
  periodLabel: string
}

/**
 * Bygger notifikationstitel + body för svenska användare.
 */
export function buildNotificationContent(p: VatNotificationPayload): {
  title: string
  body: string
} {
  const dayWord = p.daysUntil === 1 ? 'dag' : 'dagar'
  let title: string
  if (p.daysUntil <= 0) {
    title = `Moms-deadline har passerat — ${p.companyName}`
  } else {
    title = `Moms-deadline om ${p.daysUntil} ${dayWord} — ${p.companyName}`
  }
  const body = `${p.periodLabel}: deklaration ska in senast ${p.deadlineIso}.`
  return { title, body }
}

interface RunOptions {
  /** Skickar notifikation till valfritt fönster (typiskt focused/mainWindow). */
  getWindow?: () => BrowserWindow | null
}

/**
 * Huvud-entry. Itererar alla bolag som har notify_vat_deadline=1, beräknar
 * deadline, och dispatchar notifikation om aktuell nivå inte redan triggats.
 *
 * Best-effort: ett fel per bolag loggas men hindrar inte andra bolag.
 */
export function runVatDeadlineCheck(
  db: Database.Database,
  opts: RunOptions = {},
): void {
  const todayIso = todayLocalFromNow()
  const settings = loadSettings()
  let settingsDirty = false

  const companies = listCompanies(db)
  for (const company of companies) {
    if (company.notify_vat_deadline !== 1) continue
    try {
      // För 'yearly' krävs fiscal_year_end — använd senaste FY för bolaget.
      const fyRow = db
        .prepare(
          'SELECT end_date FROM fiscal_years WHERE company_id = ? ORDER BY end_date DESC LIMIT 1',
        )
        .get(company.id) as { end_date: string } | undefined
      const fyEnd = fyRow?.end_date

      const dl = computeVatDeadline({
        frequency: company.vat_frequency as VatFrequency,
        asOf: todayIso,
        fiscal_year_end: fyEnd,
      })
      if (!dl) continue

      const lastLevel = findLastNotifiedLevel(settings, company.id, dl.dueDate)
      const decision = shouldNotify({
        daysUntil: dl.daysUntil,
        lastNotifiedLevel: lastLevel,
      })
      if (!decision.trigger || decision.level === null) continue

      const payload: VatNotificationPayload = {
        companyId: company.id,
        companyName: company.name,
        deadlineIso: dl.dueDate,
        daysUntil: dl.daysUntil,
        level: decision.level,
        periodLabel: dl.periodLabel,
      }
      const { title, body } = buildNotificationContent(payload)

      const win = opts.getWindow?.() ?? null
      if (win && !win.isDestroyed()) {
        win.webContents.send('notification:show', {
          title,
          body,
          action: 'navigate-vat',
          companyId: company.id,
        })
      }

      settings[notifKey(company.id, dl.dueDate, decision.level)] = '1'
      settingsDirty = true
    } catch (err) {
      log.error(
        `[vat-deadline-notifier] Fel för bolag ${company.id} (${company.name}):`,
        err,
      )
    }
  }

  if (settingsDirty) {
    try {
      saveSettings(settings)
    } catch (err) {
      log.error('[vat-deadline-notifier] Kunde inte spara settings:', err)
    }
  }
}
