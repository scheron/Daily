import path from "node:path"
import Database from "better-sqlite3"
import fs from "fs-extra"

import {logger} from "@daily/core"

import type {SqliteDriver, SqliteParam, SqliteRunResult} from "@daily/core"

/** Opens the SQLite file at `dbPath` through better-sqlite3 and hands it to the storage core as a driver. */
export function createBetterSqliteDriver(dbPath: string): SqliteDriver {
  fs.ensureDirSync(path.dirname(dbPath))

  logger.info(logger.CONTEXT.DB, `Initializing SQLite at: ${dbPath}`)

  const db = new Database(dbPath)

  try {
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    db.pragma("busy_timeout = 5000")
    db.pragma("synchronous = NORMAL")
    db.pragma("journal_size_limit = 67108864")
  } catch (error) {
    db.close()
    logger.error(logger.CONTEXT.DB, "Failed to initialize SQLite", error)
    throw error
  }

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
    transaction: <T>(fn: () => T) => db.transaction(fn),
    close: () => void db.close(),
  }
}
