import {AsyncMutex} from "@daily/std"

import type {SqliteDriver} from "../../database/SqliteDriver"

const mutexes = new WeakMap<SqliteDriver, AsyncMutex>()

/** Keeps a sync transaction from becoming a savepoint inside a local batch that spans awaits. */
export function getWriteMutex(db: SqliteDriver): AsyncMutex {
  let mutex = mutexes.get(db)
  if (!mutex) {
    mutex = new AsyncMutex()
    mutexes.set(db, mutex)
  }
  return mutex
}
