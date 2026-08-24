import {resolveActiveProvider, SyncServerError, SyncServerErrorCode} from "@daily/protocol"

import {DailyServerRemoteAdapter} from "../../storage/sync/adapters/DailyServerRemoteAdapter"
import {ICloudRemoteAdapter} from "../../storage/sync/adapters/ICloudRemoteAdapter"

import type {SyncProvider, SyncRemote, SyncSettings} from "@daily/protocol"

export {resolveActiveProvider}

/** Builds the remotes `SyncEngine` should run against: at most one, matching `resolveActiveProvider`. */
export function buildSyncRemotes(sync: SyncSettings, paths: {icloudSyncDir: string}): SyncRemote[] {
  const provider = resolveActiveProvider(sync)

  if (provider === "icloud") {
    return [{id: "icloud", label: "iCloud", adapter: new ICloudRemoteAdapter(paths.icloudSyncDir)}]
  }

  if (provider === "server" && sync.server.binding) {
    return [{id: "daily-server", label: "Self-hosted Daily", adapter: new DailyServerRemoteAdapter(sync.server.binding)}]
  }

  return []
}

/** Throws when a settings value would leave both iCloud and a bound server writable at once. */
export function assertSingleActiveProvider(sync: SyncSettings): void {
  if (sync.iCloud.enabled && sync.server.enabled && sync.server.binding !== null) {
    throw new SyncServerError(SyncServerErrorCode.PROVIDER_CONFLICT, "Only one sync provider can be active at a time")
  }
}

/**
 * The sync settings a device would hold once `target` is its provider: one position enabled and
 * the other two off. The server credential survives every target, including `"off"` — unbinding
 * this Mac from its server is a separate explicit act.
 *
 * @param sync - The sync settings as they stand now.
 * @param target - The position being moved to.
 * @throws SyncServerError NO_BINDING when the server is asked for without a stored credential.
 */
export function nextSyncSettings(sync: SyncSettings, target: SyncProvider): SyncSettings {
  if (target === "server" && !sync.server.binding) {
    throw new SyncServerError(SyncServerErrorCode.NO_BINDING, "This device is not connected to a Daily Sync Server")
  }

  return {
    iCloud: {enabled: target === "icloud"},
    server: {enabled: target === "server", binding: sync.server.binding},
  }
}
