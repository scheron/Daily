import path from "node:path"
import Database from "better-sqlite3"
import fs from "fs-extra"

export type SqliteParam = string | number | bigint | Uint8Array | null

export type SqliteRunResult = {changes: number; lastInsertRowid: number | bigint}

export type SqliteStatement = {
  run(...params: SqliteParam[]): SqliteRunResult
  get<T>(...params: SqliteParam[]): T | undefined
  all<T>(...params: SqliteParam[]): T[]
}

export type SqliteTransaction<T> = (() => T) & {immediate(): T}

/** The database surface the server store consumes, implemented here over better-sqlite3 under the Node ABI. */
export type SqliteDriver = {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
  pragma(statement: string): void
  transaction<T>(fn: () => T): SqliteTransaction<T>
  close(): void
}

/** Opens the SQLite file at `dbPath` through better-sqlite3 and hands it to the server store as a driver. */
export function createBetterSqliteDriver(dbPath: string): SqliteDriver {
  fs.ensureDirSync(path.dirname(dbPath))

  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.pragma("synchronous = NORMAL")
  db.pragma("journal_size_limit = 67108864")

  return {
    prepare(sql: string) {
      const statement = db.prepare(sql)
      return {
        run: (...params: SqliteParam[]) => statement.run(...params) as SqliteRunResult,
        get: <T>(...params: SqliteParam[]) => statement.get(...params) as T | undefined,
        all: <T>(...params: SqliteParam[]) => statement.all(...params) as T[],
      }
    },
    exec: (sql: string) => void db.exec(sql),
    pragma: (statement: string) => void db.pragma(statement),
    transaction: <T>(fn: () => T) => db.transaction(fn) as SqliteTransaction<T>,
    close: () => void db.close(),
  }
}
