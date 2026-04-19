// User vault — filesystem layout for multi-user local auth (ADR 004 §1).
//
// Layout:
//   <root>/
//     users.json              {version, users: [{id, displayName, createdAt}]}
//     users/
//       <userId>/
//         app.db              SQLCipher-encrypted per-user DB (created by db.ts)
//         keys.json           {version, passwordBlob, recoveryBlob}
//         backups/            per-user backup dir
//
// Responsibilities:
// - Resolve filesystem paths
// - Read/write users.json and keys.json
// - Create/list/delete user directories
// - DOES NOT touch the DB, does not derive keys, does not know about passwords
//   directly. Just serializes/deserializes Envelope blobs (opaque to vault).

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Envelope } from './crypto'

export interface UserMeta {
  id: string
  displayName: string
  createdAt: string // ISO-8601
}

interface UsersIndex {
  version: 1
  users: UserMeta[]
}

export interface UserKeys {
  version: 1
  passwordBlob: Envelope
  recoveryBlob: Envelope
}

const USERS_INDEX_VERSION = 1
const USER_KEYS_VERSION = 1

export class UserVault {
  constructor(private readonly root: string) {}

  /** Ensure root directory exists. */
  ensureRoot(): void {
    fs.mkdirSync(this.root, { recursive: true })
  }

  private indexPath(): string {
    return path.join(this.root, 'users.json')
  }

  private userDir(userId: string): string {
    return path.join(this.root, 'users', userId)
  }

  dbPath(userId: string): string {
    return path.join(this.userDir(userId), 'app.db')
  }

  keysPath(userId: string): string {
    return path.join(this.userDir(userId), 'keys.json')
  }

  backupsDir(userId: string): string {
    return path.join(this.userDir(userId), 'backups')
  }

  /** Read index. Returns empty list if file doesn't exist. */
  listUsers(): UserMeta[] {
    const p = this.indexPath()
    if (!fs.existsSync(p)) return []
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as UsersIndex
    if (parsed.version !== USERS_INDEX_VERSION) {
      throw new Error(
        `users.json version ${parsed.version} unsupported (expected ${USERS_INDEX_VERSION})`,
      )
    }
    return parsed.users
  }

  private writeIndex(users: UserMeta[]): void {
    this.ensureRoot()
    const payload: UsersIndex = { version: USERS_INDEX_VERSION, users }
    const tmp = this.indexPath() + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), {
      mode: 0o600,
    })
    fs.renameSync(tmp, this.indexPath())
  }

  /**
   * Create a new user entry: fresh random id, metadata in index, empty user
   * directory, persist keys blobs. Does NOT create the DB file — that's the
   * caller's responsibility (db.ts after first-open with the master key).
   */
  createUser(displayName: string, keys: UserKeys): UserMeta {
    const trimmed = displayName.trim()
    if (!trimmed) throw new Error('displayName required')
    if (trimmed.length > 100) throw new Error('displayName too long')
    const existing = this.listUsers()
    const id = crypto.randomUUID()
    const meta: UserMeta = {
      id,
      displayName: trimmed,
      createdAt: new Date().toISOString(),
    }
    const dir = this.userDir(id)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.mkdirSync(this.backupsDir(id), { recursive: true, mode: 0o700 })
    this.writeKeys(id, keys)
    this.writeIndex([...existing, meta])
    return meta
  }

  /** Read keys.json for a user. Throws if missing or malformed. */
  readKeys(userId: string): UserKeys {
    const raw = fs.readFileSync(this.keysPath(userId), 'utf8')
    const parsed = JSON.parse(raw) as UserKeys
    if (parsed.version !== USER_KEYS_VERSION) {
      throw new Error(
        `keys.json version ${parsed.version} unsupported (expected ${USER_KEYS_VERSION})`,
      )
    }
    if (!parsed.passwordBlob || !parsed.recoveryBlob) {
      throw new Error('keys.json malformed — missing blobs')
    }
    return parsed
  }

  /** Atomic-ish keys.json write (write tmp + rename). */
  writeKeys(userId: string, keys: UserKeys): void {
    const dir = this.userDir(userId)
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const payload: UserKeys = { ...keys, version: USER_KEYS_VERSION }
    const target = this.keysPath(userId)
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, target)
  }

  /** Delete a user: remove dir + index entry. Irreversible. */
  deleteUser(userId: string): void {
    const users = this.listUsers()
    const filtered = users.filter((u) => u.id !== userId)
    if (filtered.length === users.length) {
      throw new Error(`user ${userId} not found`)
    }
    const dir = this.userDir(userId)
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    this.writeIndex(filtered)
  }

  /** Rename display name without touching keys or DB. */
  renameUser(userId: string, newDisplayName: string): void {
    const trimmed = newDisplayName.trim()
    if (!trimmed) throw new Error('displayName required')
    if (trimmed.length > 100) throw new Error('displayName too long')
    const users = this.listUsers()
    const idx = users.findIndex((u) => u.id === userId)
    if (idx < 0) throw new Error(`user ${userId} not found`)
    users[idx] = { ...users[idx], displayName: trimmed }
    this.writeIndex(users)
  }

  findUser(userId: string): UserMeta | undefined {
    return this.listUsers().find((u) => u.id === userId)
  }
}
