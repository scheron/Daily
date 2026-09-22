import path from "node:path"

import {ensureAssetsDir, sweepPartialUploads} from "../assets/AssetStore"
import {loadIdentity} from "../identity/ServerIdentityStore"
import {createBetterSqliteDriver} from "./betterSqliteDriver"
import {runMigrations} from "./migrate"
import {migrations} from "./migrations"

import type {SqliteDriver} from "./betterSqliteDriver"

export type ServerStore = {db: SqliteDriver; dataDir: string; close(): void}

/**
 * Opens the server's SQLite database under `dataDir`, applying every pending migration and ensuring
 * the identity row exists — named `defaultName` when the row is created here.
 */
export function openServerStore(dataDir: string, defaultName?: string): ServerStore {
  const db = createBetterSqliteDriver(path.join(dataDir, "server.sqlite"))

  runMigrations(db, migrations)

  const store: ServerStore = {
    db,
    dataDir,
    close: () => db.close(),
  }

  loadIdentity(store, defaultName)
  ensureAssetsDir(store)
  sweepPartialUploads(store)

  return store
}
