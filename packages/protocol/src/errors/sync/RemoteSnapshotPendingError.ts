/**
 * Thrown by the remote storage adapter when an iCloud snapshot is still
 * downloading. The sync engine catches this and retries later instead of
 * treating it as a hard failure.
 */
export class RemoteSnapshotPendingError extends Error {
  constructor(message = "Remote snapshot is still downloading from iCloud") {
    super(message)
    this.name = "RemoteSnapshotPendingError"
  }
}
