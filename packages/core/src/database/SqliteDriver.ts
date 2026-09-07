export type SqliteParam = string | number | bigint | Uint8Array | null

export type SqliteRunResult = {changes: number; lastInsertRowid: number | bigint}

export type SqliteStatement = {
  run(...params: SqliteParam[]): SqliteRunResult
  get<T>(...params: SqliteParam[]): T | undefined
  all<T>(...params: SqliteParam[]): T[]
}

/** The database surface the storage core consumes. Each runtime supplies its own adapter over its own SQLite library. */
export type SqliteDriver = {
  prepare(sql: string): SqliteStatement
  exec(sql: string): void
  pragma(statement: string): void
  transaction<T>(fn: () => T): () => T
  close(): void
}
