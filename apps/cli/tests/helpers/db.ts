// @ts-nocheck
import {DatabaseSync} from "node:sqlite"

import {initDatabase} from "@daily/core"

import type {SqliteDriver, SqliteParam, SqliteRunResult} from "@daily/core"

/** An in-memory, fully migrated database behind the driver port, built on node:sqlite. */
export function createTestDatabase(): SqliteDriver {
  const db = new DatabaseSync(":memory:")

  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")

  const driver: SqliteDriver = {
    prepare(sql: string) {
      const statement = db.prepare(sql)
      return {
        run: (...params: SqliteParam[]) => {
          const result = statement.run(...params)
          return {changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid} satisfies SqliteRunResult
        },
        get: <T>(...params: SqliteParam[]) => statement.get(...params) as T | undefined,
        all: <T>(...params: SqliteParam[]) => statement.all(...params) as T[],
      }
    },
    exec: (sql: string) => void db.exec(sql),
    pragma: (statement: string) => void db.exec(`PRAGMA ${statement}`),
    transaction:
      <T>(fn: () => T) =>
      () => {
        db.exec("BEGIN")
        try {
          const result = fn()
          db.exec("COMMIT")
          return result
        } catch (error) {
          db.exec("ROLLBACK")
          throw error
        }
      },
    close: () => void db.close(),
  }

  initDatabase(driver)

  return driver
}
