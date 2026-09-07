import {isDeepStrictEqual} from "node:util"

import {SyncServerError, SyncServerErrorCode} from "@daily/protocol"
import {isEqual} from "@daily/std"

import {logger} from "../../utils/logger"
import {assertSingleActiveProvider, nextSyncSettings} from "../../utils/sync/syncProvider"

import type {
  MigrationDirection,
  MigrationPreview,
  ProviderCounts,
  Settings,
  SnapshotDocs,
  SyncProvider,
  SyncRemote,
  SyncRemoteState,
  SyncSettings,
  SyncStrategy,
} from "@daily/protocol"

type ProviderMigrationDeps = {
  loadSettings: () => Promise<Settings>
  saveSettings: (partial: Partial<Settings>) => Promise<void>
  loadLocalDocs: () => Promise<SnapshotDocs>
  buildRemotes: (sync: SyncSettings) => SyncRemote[]
  setRemotes: (remotes: SyncRemote[]) => void
  getRemoteStates: () => SyncRemoteState[]
  disableAutoSync: () => void
  syncOnce: (strategy: SyncStrategy) => Promise<void>
  /** Puts the engine back on the provider the stored settings name, and restarts auto-sync and the probe for it. */
  applyRemoteConfiguration: () => Promise<void>
  stopProbe: () => void
}

type LiveIds = Record<keyof ProviderCounts, Set<string>>

type SyncableRow = {id: string; updated_at: string; deleted_at: string | null}

const ICLOUD_TARGET_NAME = "iCloud"

/**
 * Moving this device from one sync provider to another: reading what the target holds before
 * anything moves, and performing the move as one merge cycle through the engine the app already
 * syncs with.
 *
 * The provider is written only once that cycle has landed on both sides. Anything short of that
 * — an unreachable target, a lost conditional write — leaves the settings, the engine's remotes
 * and auto-sync as they were, so a failed migration keeps the person on the provider they were
 * already syncing with.
 */
export class ProviderMigrationService {
  constructor(private readonly deps: ProviderMigrationDeps) {}

  /**
   * What both sides hold and how they differ, counted over live records only — except the
   * conflict count, which also counts a record deleted on one side and edited on the other.
   * Writes nothing to either side, and leaves the active provider exactly where it is.
   *
   * @param target - The provider being considered.
   */
  async preview(target: Exclude<SyncProvider, "off">): Promise<MigrationPreview> {
    const settings = await this.deps.loadSettings()
    const nextSync = nextSyncSettings(settings.sync, target)
    const remote = this.targetRemote(nextSync)

    const snapshot = await remote.adapter.loadSnapshot()
    const localDocs = await this.deps.loadLocalDocs()

    const local = liveIdSets(localDocs)
    const remoteIds = liveIdSets(snapshot?.docs ?? null)

    return {
      target,
      targetName: this.targetName(target, nextSync),
      targetHasSnapshot: snapshot !== null,
      local: countIds(local),
      remote: countIds(remoteIds),
      onlyOnLocal: countIdsMissingFrom(local, remoteIds),
      onlyOnRemote: countIdsMissingFrom(remoteIds, local),
      conflicts: countConflicts(localDocs, snapshot?.docs ?? null),
    }
  }

  /**
   * Moves this device to `target`: one merge cycle against the target alone, with the direction
   * deciding the ties, and the settings written only after that cycle has landed.
   *
   * @param target - The provider to move to.
   * @param direction - Which side wins a tie; `null` only for `"off"`, which merges nothing.
   * @throws SyncServerError MIGRATION_FAILED when the cycle fails or the target does not confirm it, after the engine has been put back.
   */
  async migrate(target: SyncProvider, direction: MigrationDirection | null): Promise<void> {
    const settings = await this.deps.loadSettings()
    const nextSync = nextSyncSettings(settings.sync, target)
    assertSingleActiveProvider(nextSync)

    if (target === "off") {
      logger.info(logger.CONTEXT.SYNC_REMOTE, "Turning syncing off; the server credential is kept")
      this.deps.disableAutoSync()
      this.deps.stopProbe()
      await this.deps.saveSettings({sync: nextSync})
      return
    }

    if (direction === null) {
      throw new SyncServerError(SyncServerErrorCode.DIRECTION_REQUIRED, "Switching provider needs a direction for the records both sides hold")
    }

    const remote = this.targetRemote(nextSync)

    this.deps.disableAutoSync()
    this.deps.stopProbe()
    this.deps.setRemotes([remote])

    const lastSyncAtBefore = this.remoteState(remote.id)?.lastSyncAt ?? null

    let failure = await this.runMigrationCycle(direction)
    if (!failure) failure = this.confirmLanded(remote.id, lastSyncAtBefore)

    if (failure) {
      logger.warn(logger.CONTEXT.SYNC_REMOTE, `Migration to "${target}" failed, restoring the stored provider`, failure)
      await this.deps.applyRemoteConfiguration()
      throw new SyncServerError(SyncServerErrorCode.MIGRATION_FAILED, failure)
    }

    await this.deps.saveSettings({sync: nextSync})
    logger.info(logger.CONTEXT.SYNC_REMOTE, `Migrated syncing to "${target}" with "${direction}"`)
  }

  private async runMigrationCycle(direction: MigrationDirection): Promise<string | null> {
    try {
      await this.deps.syncOnce(direction === "keep-local" ? "push" : "pull")
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * A cycle that threw is not the only way to fail: a revisioned remote that loses every
   * conditional-write race records the conflict and returns, which for a background cycle means
   * "next time" and for a migration means the person's state never reached the target. The move
   * counts as landed only when this call left no error behind and moved the target's last sync.
   */
  private confirmLanded(remoteId: string, lastSyncAtBefore: string | null): string | null {
    const state = this.remoteState(remoteId)
    if (state?.lastError) return state.lastError
    if (!state || state.lastSyncAt === lastSyncAtBefore) return "The target did not confirm the merge"
    return null
  }

  private remoteState(remoteId: string): SyncRemoteState | undefined {
    return this.deps.getRemoteStates().find((state) => state.id === remoteId)
  }

  private targetRemote(sync: SyncSettings): SyncRemote {
    const [remote] = this.deps.buildRemotes(sync)
    if (!remote) throw new SyncServerError(SyncServerErrorCode.NO_BINDING, "That provider has nothing to sync with on this device")
    return remote
  }

  private targetName(target: Exclude<SyncProvider, "off">, sync: SyncSettings): string {
    return target === "server" && sync.server.binding ? sync.server.binding.serverName : ICLOUD_TARGET_NAME
  }
}

function liveIdSets(docs: SnapshotDocs | null): LiveIds {
  return {
    tasks: liveIds(docs?.tasks ?? []),
    tags: liveIds(docs?.tags ?? []),
    branches: liveIds(docs?.branches ?? []),
  }
}

function liveIds(rows: {id: string; deleted_at: string | null}[]): Set<string> {
  return new Set(rows.filter(isLive).map((row) => row.id))
}

function isLive(row: {deleted_at: string | null}): boolean {
  return row.deleted_at === null
}

function countConflicts(local: SnapshotDocs, remote: SnapshotDocs | null): ProviderCounts {
  return {
    tasks: countContested(local.tasks, remote?.tasks ?? []),
    tags: countContested(local.tags, remote?.tags ?? []),
    branches: countContested(local.branches, remote?.branches ?? []),
  }
}

/**
 * The records the direction actually decides. `mergeDoc` consults the strategy only where both
 * sides hold the record and neither `updated_at` is newer than the other, so a record one side
 * edited later is settled without a direction, and a tie between two identical copies survives
 * either answer unchanged.
 */
function countContested<D extends SyncableRow>(local: D[], remote: D[]): number {
  const remoteById = new Map(remote.map((row) => [row.id, row]))

  let contested = 0

  for (const row of local) {
    const counterpart = remoteById.get(row.id)
    if (!counterpart) continue

    if (isEqual(row.updated_at, counterpart.updated_at) && !isDeepStrictEqual(row, counterpart)) contested++
  }

  return contested
}

function countIds(ids: LiveIds): ProviderCounts {
  return {tasks: ids.tasks.size, tags: ids.tags.size, branches: ids.branches.size}
}

function countIdsMissingFrom(ids: LiveIds, other: LiveIds): ProviderCounts {
  return {
    tasks: countMissing(ids.tasks, other.tasks),
    tags: countMissing(ids.tags, other.tags),
    branches: countMissing(ids.branches, other.branches),
  }
}

function countMissing(ids: Set<string>, other: Set<string>): number {
  let missing = 0
  for (const id of ids) if (!other.has(id)) missing++
  return missing
}
