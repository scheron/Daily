import path from "node:path"
import {DatabaseSync} from "node:sqlite"
import fs from "fs-extra"

import {logger} from "@daily/core"

import type {SqliteDriver, SqliteParam, SqliteRunResult} from "@daily/core"

/** Opens the SQLite file at `dbPath` through node:sqlite and hands it to the storage core as a driver. */
export function createNodeSqliteDriver(dbPath: string): SqliteDriver {
  fs.ensureDirSync(path.dirname(dbPath))

  logger.info(logger.CONTEXT.DB, `Initializing SQLite at: ${dbPath}`)

  const db = new DatabaseSync(dbPath)

  try {
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")
    db.exec("PRAGMA busy_timeout = 5000")
    db.exec("PRAGMA synchronous = NORMAL")
    db.exec("PRAGMA journal_size_limit = 67108864")
  } catch (error) {
    db.close()
    logger.error(logger.CONTEXT.DB, "Failed to initialize SQLite", error)
    throw error
  }

  return {
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
}
