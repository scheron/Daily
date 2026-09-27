import {dataPaths} from "@daily/core/config/paths"
import {createStorageCore} from "@daily/core/storage/createStorageCore"
import {runMigrations} from "@daily/core/storage/database/scripts/migrate"
import {WorkStorage} from "@daily/core/storage/WorkStorage"
import {assertKnownSnapshotVersion, KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@daily/core/utils/sync/snapshot/buildSnapshot"
import {isValidSnapshot} from "@daily/core/utils/sync/snapshot/isValidSnapshot"
import {normalizeSnapshotDocs} from "@daily/core/utils/sync/snapshot/normalizeSnapshotDocs"
import {ProtocolError, ProtocolErrorCode, SnapshotVersionAheadError} from "@daily/protocol"
import {AsyncMutex} from "@daily/std"
import {createClock, ToolError, ToolErrorCode} from "@daily/tools"

import {readSnapshot, writeSnapshotIfUnchanged} from "../snapshot/SnapshotStore"
import {createInMemorySqliteDriver} from "../store/betterSqliteDriver"
import {buildServerFilesPort} from "./attachments"

import type {ActorSource, Snapshot, SnapshotDocs} from "@daily/protocol"
import type {ToolClock, ToolContext, ToolMode} from "@daily/tools"
import type {ServerStore} from "../store/instance"

/**
 * The agent a tool call runs as: the Mac it was approved from, the time zone that Mac reads its
 * days in, and the name it was approved under — the `agents` row's own `name`, never anything the
 * call itself carries, so a tool can attribute what it writes to the client a person let in.
 */
export type AgentIdentity = {deviceId: string; timeZone: string; name: string}

export type AgentWorkspaceDeps = {store: ServerStore; now?: () => Date}

/** Durable work a tool call defers until the snapshot it wrote has actually committed. */
export type AgentCommitEffect = () => Promise<void>

/** How many times a write-mode call rebuilds and retries after losing a race, before it refuses. */
export const AGENT_WRITE_ATTEMPTS = 3

const SNAPSHOT_UNREADABLE_MESSAGE = "The Daily data stored on this server could not be read."

const writeLocks = new WeakMap<ServerStore, AsyncMutex>()

/**
 * Runs one tool call against the snapshot the server stores: loads it into a throwaway in-memory
 * core, hands `run` the shared host context over it, and — in write mode — stores the rebuilt
 * snapshot back at the revision it was read at, attributed to the agent's Mac.
 *
 * @param mode `"read"` never writes and makes one attempt; `"write"` and `"delete"` are both serialised per store and retry a lost race up to `AGENT_WRITE_ATTEMPTS` times.
 * @throws ToolError when the stored snapshot cannot serve the call, when every write attempt loses its race, or when `run` itself refuses.
 */
export async function runInAgentWorkspace<T>(
  deps: AgentWorkspaceDeps,
  agent: AgentIdentity,
  mode: ToolMode,
  run: (ctx: ToolContext) => Promise<T>,
): Promise<T> {
  const clock = buildAgentClock(agent.timeZone, deps.now)

  if (mode === "read") return runAttempt(deps.store, agent, clock, mode, run)

  let lock = writeLocks.get(deps.store)
  if (!lock) {
    lock = new AsyncMutex()
    writeLocks.set(deps.store, lock)
  }

  return lock.runExclusive(async () => {
    for (let attempt = 1; attempt <= AGENT_WRITE_ATTEMPTS; attempt++) {
      try {
        return await runAttempt(deps.store, agent, clock, mode, run)
      } catch (error) {
        if (!(error instanceof ProtocolError) || error.code !== ProtocolErrorCode.REVISION_CONFLICT) throw error
      }
    }

    throw new ToolError(
      ToolErrorCode.WRITE_CONFLICT,
      "Something else changed this server's data while the call was running. Nothing was written — try again.",
    )
  })
}

function buildAgentClock(timeZone: string, now?: () => Date): ToolClock {
  try {
    return createClock(timeZone, now)
  } catch (error) {
    if (error instanceof ToolError && error.code === ToolErrorCode.INVALID_TIME_ZONE) {
      throw new ToolError(ToolErrorCode.INVALID_TIME_ZONE, `Unknown time zone "${timeZone}". This server cannot tell which day it is on that Mac.`)
    }
    throw error
  }
}

async function runAttempt<T>(
  store: ServerStore,
  agent: AgentIdentity,
  clock: ToolClock,
  mode: ToolMode,
  run: (ctx: ToolContext) => Promise<T>,
): Promise<T> {
  const stored = readSnapshot(store)

  if (!stored) {
    throw new ToolError(
      ToolErrorCode.NO_DATA_YET,
      "This server has no Daily data yet. Open Daily on a Mac bound to it and let it sync once, then try again.",
    )
  }

  try {
    assertKnownSnapshotVersion(stored.document)
  } catch (error) {
    if (!(error instanceof SnapshotVersionAheadError)) throw error

    throw new ToolError(
      ToolErrorCode.SERVER_TOO_OLD,
      "This server is older than the data on your Macs. Upgrade the Daily Sync Server, then try again.",
    )
  }

  if (!isValidSnapshot(stored.document as Snapshot)) {
    throw new ToolError(ToolErrorCode.SNAPSHOT_UNREADABLE, SNAPSHOT_UNREADABLE_MESSAGE)
  }

  if (mode !== "read" && stored.version !== KNOWN_SNAPSHOT_VERSION) {
    throw new ToolError(
      ToolErrorCode.SNAPSHOT_TOO_OLD,
      "The data on this server is older than this server understands. Update Daily on your Macs and let one of them sync before changing anything.",
    )
  }

  const db = createInMemorySqliteDriver()

  try {
    runMigrations(db)

    const core = createStorageCore(db, {...dataPaths(() => store.dataDir), remoteSyncPath: () => ""}, {today: () => clock.today()})

    try {
      await core.localAdapter.upsertDocs(normalizeSnapshotDocs(stored.document.docs as SnapshotDocs))
    } catch {
      throw new ToolError(ToolErrorCode.SNAPSHOT_UNREADABLE, SNAPSHOT_UNREADABLE_MESSAGE)
    }

    const commitEffects: AgentCommitEffect[] = []
    const afterCommit = (effect: AgentCommitEffect) => {
      commitEffects.push(effect)
    }

    const workStorage = new WorkStorage(core, db, () => {})
    const source: ActorSource = {kind: "mcp", provider: agent.name}
    const files = buildServerFilesPort(store, agent.deviceId, afterCommit)

    const result = await run({workStorage, clock, source, files})
    if (mode === "read") return result

    const built = buildSnapshot(await core.localAdapter.loadAllDocs())
    if (built.meta.hash === stored.hash) return result

    if (built.version !== stored.version) {
      throw new ToolError(ToolErrorCode.INTERNAL, `Refusing to move the stored snapshot from version ${stored.version} to ${built.version}.`)
    }

    try {
      writeSnapshotIfUnchanged(store, built, stored.revision, agent.deviceId)
    } catch (error) {
      if (error instanceof ProtocolError && error.code !== ProtocolErrorCode.REVISION_CONFLICT) {
        throw new ToolError(ToolErrorCode.INTERNAL, error.message)
      }

      throw error
    }

    for (const effect of commitEffects) await effect()

    return result
  } finally {
    db.close()
  }
}
