// @ts-nocheck
import Database from "better-sqlite3"

import {runMigrations} from "../../src/storage/database/scripts/migrate"

import type {SqliteDriver, SqliteParam, SqliteRunResult} from "../../src/database/SqliteDriver"

export function createTestDatabase(): SqliteDriver {
  const db = new Database(":memory:")

  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  const driver: SqliteDriver = {
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
    transaction: <T>(fn: () => T) => db.transaction(fn),
    close: () => void db.close(),
    get inTransaction() {
      return db.inTransaction
    },
  }

  runMigrations(driver)

  return driver
}
