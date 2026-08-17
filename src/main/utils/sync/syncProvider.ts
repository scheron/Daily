import {SyncServerError} from "@shared/errors/sync/SyncServerError"
import {SyncServerErrorCode} from "@shared/errors/sync/SyncServerErrorCode"

import {DailyServerRemoteAdapter} from "@/storage/sync/adapters/DailyServerRemoteAdapter"
import {ICloudRemoteAdapter} from "@/storage/sync/adapters/ICloudRemoteAdapter"

import type {SyncRemote} from "@/types/sync"
import type {SyncSettings} from "@shared/types/storage"

export type ActiveSyncProvider = "off" | "icloud" | "server"

/**
 * Which single sync provider is active for a device's settings, never more than one. A server
 * binding wins a state where both flags are somehow set, since that state is unreachable through
 * `assertICloudCanBeEnabled`/`assertServerCanBeBound` and resolving it to two remotes is the one
 * outcome the spec forbids outright.
 */
export function resolveActiveProvider(sync: SyncSettings): ActiveSyncProvider {
  if (sync.server.enabled && sync.server.binding) return "server"
  if (sync.iCloud.enabled) return "icloud"
  return "off"
}

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

/** Throws when enabling iCloud would leave a server binding writable alongside it. */
export function assertICloudCanBeEnabled(sync: SyncSettings): void {
  if (sync.server.enabled && sync.server.binding) {
    throw new SyncServerError(SyncServerErrorCode.PROVIDER_CONFLICT, "Self-hosted Daily is connected; disconnect it before turning on iCloud sync")
  }
}

/** Throws when binding a server would leave iCloud writable alongside it. */
export function assertServerCanBeBound(sync: SyncSettings): void {
  if (sync.iCloud.enabled) {
    throw new SyncServerError(SyncServerErrorCode.PROVIDER_CONFLICT, "iCloud sync is on; turn it off before connecting Self-hosted Daily")
  }
}
