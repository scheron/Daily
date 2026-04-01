export class RemoteSnapshotPendingError extends Error {
  constructor(message = "Remote snapshot is still downloading from iCloud") {
    super(message)
    this.name = "RemoteSnapshotPendingError"
  }
}
