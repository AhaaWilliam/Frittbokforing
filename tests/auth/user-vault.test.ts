import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { UserVault, type UserKeys } from '../../src/main/auth/user-vault'
import {
  generateMasterKey,
  sealMasterKey,
} from '../../src/main/auth/crypto'

const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

async function makeKeys(pw: string, rk: string): Promise<UserKeys> {
  const K = generateMasterKey()
  return {
    version: 1,
    passwordBlob: await sealMasterKey(K, Buffer.from(pw), FAST_KDF),
    recoveryBlob: await sealMasterKey(K, Buffer.from(rk), FAST_KDF),
  }
}

let tmpRoot: string
let vault: UserVault

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'user-vault-'))
  vault = new UserVault(tmpRoot)
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('user-vault — empty state', () => {
  it('returns empty list when users.json does not exist', () => {
    expect(vault.listUsers()).toEqual([])
  })

  it('ensureRoot creates root dir', () => {
    const freshRoot = path.join(tmpRoot, 'nested', 'deep')
    const v = new UserVault(freshRoot)
    v.ensureRoot()
    expect(fs.existsSync(freshRoot)).toBe(true)
  })
})

describe('user-vault — createUser', () => {
  it('creates user directory and writes keys.json', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    expect(meta.displayName).toBe('Alice')
    expect(meta.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(meta.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(fs.existsSync(vault.keysPath(meta.id))).toBe(true)
    expect(fs.existsSync(vault.backupsDir(meta.id))).toBe(true)
  })

  it('adds entry to users.json', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    const list = vault.listUsers()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(meta)
  })

  it('supports multiple users', async () => {
    const a = vault.createUser('Alice', await makeKeys('pw1', 'rk1'))
    const b = vault.createUser('Bob', await makeKeys('pw2', 'rk2'))
    const list = vault.listUsers()
    expect(list.map((u) => u.displayName)).toEqual(['Alice', 'Bob'])
    expect(a.id).not.toBe(b.id)
  })

  it('each user has isolated key dir', async () => {
    const a = vault.createUser('Alice', await makeKeys('pw1', 'rk1'))
    const b = vault.createUser('Bob', await makeKeys('pw2', 'rk2'))
    expect(vault.keysPath(a.id)).not.toBe(vault.keysPath(b.id))
    expect(vault.dbPath(a.id)).not.toBe(vault.dbPath(b.id))
  })

  it('rejects empty displayName', async () => {
    const keys = await makeKeys('pw', 'rk')
    expect(() => vault.createUser('', keys)).toThrow(/required/)
    expect(() => vault.createUser('   ', keys)).toThrow(/required/)
  })

  it('rejects overly long displayName', async () => {
    const keys = await makeKeys('pw', 'rk')
    expect(() => vault.createUser('x'.repeat(101), keys)).toThrow(/too long/)
  })

  it('trims whitespace in displayName', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('  Alice  ', keys)
    expect(meta.displayName).toBe('Alice')
  })
})

describe('user-vault — readKeys', () => {
  it('roundtrips keys via readKeys', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    const read = vault.readKeys(meta.id)
    expect(read.version).toBe(1)
    expect(read.passwordBlob).toEqual(keys.passwordBlob)
    expect(read.recoveryBlob).toEqual(keys.recoveryBlob)
  })

  it('throws if keys.json missing', () => {
    expect(() => vault.readKeys('nonexistent-id')).toThrow()
  })

  it('throws on unsupported version', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    fs.writeFileSync(
      vault.keysPath(meta.id),
      JSON.stringify({ version: 999, passwordBlob: {}, recoveryBlob: {} }),
    )
    expect(() => vault.readKeys(meta.id)).toThrow(/version 999/)
  })

  it('throws on missing blobs', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    fs.writeFileSync(
      vault.keysPath(meta.id),
      JSON.stringify({ version: 1, passwordBlob: keys.passwordBlob }),
    )
    expect(() => vault.readKeys(meta.id)).toThrow(/malformed/)
  })
})

describe('user-vault — writeKeys (re-seal)', () => {
  it('overwrites existing keys.json atomically', async () => {
    const keys1 = await makeKeys('pw1', 'rk')
    const meta = vault.createUser('Alice', keys1)
    const keys2 = await makeKeys('pw2', 'rk') // new password, same recovery
    vault.writeKeys(meta.id, keys2)
    const read = vault.readKeys(meta.id)
    expect(read.passwordBlob).toEqual(keys2.passwordBlob)
    expect(read.recoveryBlob).toEqual(keys2.recoveryBlob)
  })

  it('leaves no .tmp file behind on success', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    vault.writeKeys(meta.id, keys)
    const files = fs.readdirSync(path.dirname(vault.keysPath(meta.id)))
    expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0)
  })
})

describe('user-vault — deleteUser', () => {
  it('removes directory and index entry', async () => {
    const a = vault.createUser('Alice', await makeKeys('pw1', 'rk1'))
    const b = vault.createUser('Bob', await makeKeys('pw2', 'rk2'))
    vault.deleteUser(a.id)
    expect(vault.listUsers().map((u) => u.id)).toEqual([b.id])
    expect(fs.existsSync(path.dirname(vault.keysPath(a.id)))).toBe(false)
  })

  it('throws when user not found', () => {
    expect(() => vault.deleteUser('nonexistent')).toThrow(/not found/)
  })

  it('survives if directory already deleted externally', async () => {
    const a = vault.createUser('Alice', await makeKeys('pw', 'rk'))
    fs.rmSync(path.dirname(vault.keysPath(a.id)), {
      recursive: true,
      force: true,
    })
    expect(() => vault.deleteUser(a.id)).not.toThrow()
    expect(vault.listUsers()).toEqual([])
  })
})

describe('user-vault — renameUser', () => {
  it('updates displayName without touching keys', async () => {
    const keys = await makeKeys('pw', 'rk')
    const a = vault.createUser('Alice', keys)
    vault.renameUser(a.id, 'Alicia')
    expect(vault.findUser(a.id)?.displayName).toBe('Alicia')
    expect(vault.readKeys(a.id)).toEqual({ ...keys, version: 1 })
  })

  it('rejects empty newDisplayName', async () => {
    const a = vault.createUser('Alice', await makeKeys('pw', 'rk'))
    expect(() => vault.renameUser(a.id, '')).toThrow(/required/)
  })

  it('throws when user not found', () => {
    expect(() => vault.renameUser('nonexistent', 'X')).toThrow(/not found/)
  })
})

describe('user-vault — version check on users.json', () => {
  it('throws on unsupported index version', () => {
    fs.mkdirSync(tmpRoot, { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, 'users.json'),
      JSON.stringify({ version: 999, users: [] }),
    )
    expect(() => vault.listUsers()).toThrow(/version 999/)
  })
})

describe('user-vault — index survives process restart', () => {
  it('new vault instance reads data written by previous instance', async () => {
    const keys = await makeKeys('pw', 'rk')
    const meta = vault.createUser('Alice', keys)
    const freshVault = new UserVault(tmpRoot)
    expect(freshVault.listUsers()).toEqual([meta])
    expect(freshVault.readKeys(meta.id).passwordBlob).toEqual(keys.passwordBlob)
  })
})
