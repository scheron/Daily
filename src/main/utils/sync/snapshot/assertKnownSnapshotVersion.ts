import {SnapshotVersionAheadError} from "@shared/errors/sync/SnapshotVersionAheadError"
import {isObject} from "@shared/utils/common/validators"

export const KNOWN_SNAPSHOT_VERSION = 3

/**
 * Aborts syncing when a parsed snapshot claims a schema version newer than this
 * build knows. Unparseable/structurally broken snapshots are NOT this util's job —
 * they stay "treat as empty remote" in the adapters.
 *
 * @param parsed Raw JSON.parse result of a snapshot file.
 * @example
 * const parsed = JSON.parse(raw)
 * assertKnownSnapshotVersion(parsed)
 * if (!isValidSnapshot(parsed)) return null
 */
export function assertKnownSnapshotVersion(parsed: unknown): void {
  if (!isObject(parsed)) return
  const version = (parsed as {version?: unknown}).version
  if (typeof version === "number" && version > KNOWN_SNAPSHOT_VERSION) throw new SnapshotVersionAheadError(version)
}
