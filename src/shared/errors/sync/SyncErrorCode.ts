/**
 * Error codes thrown by the storage sync engine and its adapters.
 * For the "snapshot still downloading from iCloud" case, see
 * RemoteSnapshotPendingError — that's a class with instanceof identity.
 */
export enum SyncErrorCode {
  SnapshotLoadFailed = "Failed to load snapshot",
  SnapshotSaveFailed = "Failed to save snapshot",
  AssetSyncFailed = "Failed to sync assets",
}
