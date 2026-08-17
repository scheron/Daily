import path from "node:path"
import Database from "better-sqlite3"
import fs from "fs-extra"

import {ensureAssetsDir, sweepPartialUploads} from "../assets/AssetStore"
import {loadIdentity} from "../identity/ServerIdentityStore"
import {runMigrations} from "./migrate"
import {migrations} from "./migrations"

export type ServerStore = {db: Database.Database; dataDir: string; close(): void}

/** Opens the server's SQLite database under `dataDir`, applying every pending migration and ensuring the identity row exists. */
export function openServerStore(dataDir: string): ServerStore {
  fs.ensureDirSync(dataDir)

  const db = new Database(path.join(dataDir, "server.sqlite"))
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.pragma("synchronous = NORMAL")
  db.pragma("journal_size_limit = 67108864")

  runMigrations(db, migrations)

  const store: ServerStore = {
    db,
    dataDir,
    close: () => db.close(),
  }

  loadIdentity(store)
  ensureAssetsDir(store)
  sweepPartialUploads(store)

  return store
}
