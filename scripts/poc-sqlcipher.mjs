// POC: Verify better-sqlite3-multiple-ciphers works as drop-in replacement
// with SQLCipher encryption + key-based access control.
import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlcipher-poc-'))
const dbPath = path.join(tmp, 'test.db')
const KEY = 'correct-horse-battery-staple'
const WRONG = 'wrong-key'

console.log(`POC dir: ${tmp}`)

// 1. Create encrypted DB, write data
{
  const db = new Database(dbPath)
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`key='${KEY}'`)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT NOT NULL)')
  db.prepare('INSERT INTO t (val) VALUES (?)').run('hemlig data')
  console.log('✓ Created encrypted DB, inserted row')
  db.close()
}

// 2. Raw file MUST NOT contain plaintext "hemlig"
{
  const raw = fs.readFileSync(dbPath)
  const hasPlaintext = raw.includes(Buffer.from('hemlig'))
  const hasSqliteHeader = raw.slice(0, 16).toString().startsWith('SQLite format')
  console.log(`✓ Raw file contains 'hemlig' plaintext: ${hasPlaintext} (expect false)`)
  console.log(`✓ Raw file has SQLite header: ${hasSqliteHeader} (expect false — encrypted)`)
  if (hasPlaintext || hasSqliteHeader) {
    console.error('✗ FAIL: file is not actually encrypted')
    process.exit(1)
  }
}

// 3. Open with correct key → should read data
{
  const db = new Database(dbPath)
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`key='${KEY}'`)
  const row = db.prepare('SELECT val FROM t WHERE id=1').get()
  console.log(`✓ Opened with correct key, read: ${JSON.stringify(row)}`)
  db.close()
}

// 4. Open with wrong key → should fail
{
  let failedAsExpected = false
  try {
    const db = new Database(dbPath)
    db.pragma(`cipher='sqlcipher'`)
    db.pragma(`key='${WRONG}'`)
    db.prepare('SELECT val FROM t').get()
    console.error('✗ FAIL: wrong key should have thrown')
    db.close()
  } catch (err) {
    failedAsExpected = true
    console.log(`✓ Wrong key correctly rejected: ${err.message}`)
  }
  if (!failedAsExpected) process.exit(1)
}

// 5. Open with no key → should fail
{
  let failedAsExpected = false
  try {
    const db = new Database(dbPath)
    db.prepare('SELECT val FROM t').get()
    console.error('✗ FAIL: no key should have thrown')
    db.close()
  } catch (err) {
    failedAsExpected = true
    console.log(`✓ No key correctly rejected: ${err.message}`)
  }
  if (!failedAsExpected) process.exit(1)
}

// 6. Rekey — change password without reopening DB
{
  const NEW_KEY = 'ny-nyckel-efter-byte'
  const db = new Database(dbPath)
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`key='${KEY}'`)
  db.pragma(`rekey='${NEW_KEY}'`)
  db.close()

  const db2 = new Database(dbPath)
  db2.pragma(`cipher='sqlcipher'`)
  db2.pragma(`key='${NEW_KEY}'`)
  const row = db2.prepare('SELECT val FROM t WHERE id=1').get()
  console.log(`✓ Rekey worked, new key reads: ${JSON.stringify(row)}`)
  db2.close()
}

// cleanup
fs.rmSync(tmp, { recursive: true, force: true })
console.log('\n🎉 All POC checks passed — SQLCipher driver works on this machine')
