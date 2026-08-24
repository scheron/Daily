/**
 * Thrown when a remote snapshot was written by a newer schema version than this
 * build understands. Syncing must abort instead of overwriting the newer data.
 */
export class SnapshotVersionAheadError extends Error {
  constructor(readonly remoteVersion: number) {
    super(`Remote snapshot has schema version ${remoteVersion}, newer than this build supports. Update the app/CLI before syncing.`)
    this.name = "SnapshotVersionAheadError"
  }
}
