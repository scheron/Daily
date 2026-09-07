import type {IRemoteStorage, IRevisionedRemoteStorage} from "@daily/protocol"

/**
 * Narrows a remote to `IRevisionedRemoteStorage` when it declares support for
 * conditional writes.
 *
 * @param adapter Any remote storage adapter.
 * @example
 * if (isRevisionedRemote(adapter)) {
 *   const {snapshot, revision} = await adapter.loadSnapshotWithRevision()
 * }
 */
export function isRevisionedRemote(adapter: IRemoteStorage): adapter is IRevisionedRemoteStorage {
  return (adapter as Partial<IRevisionedRemoteStorage>).supportsRevisions === true
}
