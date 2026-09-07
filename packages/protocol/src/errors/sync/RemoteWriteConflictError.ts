/**
 * Thrown by a revisioned remote's `saveSnapshotIfUnchanged` when the expected
 * revision no longer matches the provider's current revision. `SyncEngine`'s
 * conditional-write retry loop catches this, re-reads the remote and retries
 * the write against fresh state.
 */
export class RemoteWriteConflictError extends Error {
  constructor(message = "Remote snapshot revision changed since it was last read") {
    super(message)
    this.name = "RemoteWriteConflictError"
  }
}
