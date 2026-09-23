import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it} from "vitest"

import {KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"

import {AGENT_WRITE_ATTEMPTS, runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {AgentToolErrorCode} from "../../src/errors/agent/AgentToolErrorCode"
import {readRevision, readSnapshot, writeSnapshotIfUnchanged} from "../../src/snapshot/SnapshotStore"
import {openServerStore} from "../../src/store/instance"
import {bindAgent, bindDevice, makeTaskDraft, openMacCore, rawSnapshotDocument, seedAgentStore, writeMacSnapshot} from "./helpers"

import type {ServerStore} from "../../src/store/instance"

type BareStore = {store: ServerStore; dataDir: string; close(): void}

function openBareStore(): BareStore {
  const dataDir = mkdtempSync(join(tmpdir(), "daily-agent-workspace-"))
  const store = openServerStore(dataDir)

  return {
    store,
    dataDir,
    close: () => {
      store.close()
      rmSync(dataDir, {recursive: true, force: true})
    },
  }
}

describe("the agent workspace cycle", () => {
  it("TC-9: a read-mode call sees the stored snapshot's tasks and leaves the stored revision unchanged", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(makeTaskDraft({content: "Buy milk"}))
    })

    try {
      const agent = bindAgent(seeded.store)
      const tasks = await runInAgentWorkspace({store: seeded.store}, agent, "read", async (ctx) =>
        ctx.core.tasksService.getTaskList({includeBacklog: true}),
      )

      expect(tasks.map((task) => task.content)).toContain("Buy milk")
      expect(readRevision(seeded.store)).toBe(seeded.revision)
    } finally {
      seeded.close()
    }
  })

  it("TC-10: a write-mode call advances the stored revision by one and attributes it to the agent's device", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store, "Agent's Mac")

      await runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
        await ctx.core.tasksService.createTask(makeTaskDraft({content: "Added by the agent"}))
      })

      const stored = readSnapshot(seeded.store)
      expect(stored?.revision).toBe(String(Number(seeded.revision) + 1))
      expect(stored?.writtenByDeviceId).toBe(agent.deviceId)
    } finally {
      seeded.close()
    }
  })

  it("TC-11: a write-mode call that loses one race reloads, re-applies, and the stored snapshot carries both changes", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      let firstAttempt = true

      await runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
        if (firstAttempt) {
          firstAttempt = false

          const rival = openMacCore()
          try {
            await rival.core.tasksService.createTask(makeTaskDraft({content: "Rival task"}))
            const rivalDeviceId = bindDevice(seeded.store, "Rival Mac")
            await writeMacSnapshot(seeded.store, rival, seeded.revision, rivalDeviceId)
          } finally {
            rival.close()
          }
        }

        await ctx.core.tasksService.createTask(makeTaskDraft({content: "Agent task"}))
      })

      const stored = readSnapshot(seeded.store)!
      const contents = (stored.document.docs as any).tasks.map((task: any) => task.content)
      expect(contents).toEqual(expect.arrayContaining(["Rival task", "Agent task"]))
    } finally {
      seeded.close()
    }
  })

  it("TC-12: three lost races in a row refuse WRITE_CONFLICT, having attempted exactly three times, leaving the other writer's snapshot", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = bindAgent(seeded.store)
      let attempts = 0
      let lastRivalDeviceId = ""

      await expect(
        runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
          attempts++

          const rival = openMacCore()
          try {
            await rival.core.tasksService.createTask(makeTaskDraft({content: `Rival ${attempts}`}))
            lastRivalDeviceId = bindDevice(seeded.store, `Rival Mac ${attempts}`)
            await writeMacSnapshot(seeded.store, rival, readRevision(seeded.store), lastRivalDeviceId)
          } finally {
            rival.close()
          }

          await ctx.core.tasksService.createTask(makeTaskDraft({content: "Agent task"}))
        }),
      ).rejects.toMatchObject({code: AgentToolErrorCode.WRITE_CONFLICT})

      expect(attempts).toBe(AGENT_WRITE_ATTEMPTS)

      const stored = readSnapshot(seeded.store)!
      expect(stored.writtenByDeviceId).toBe(lastRivalDeviceId)
    } finally {
      seeded.close()
    }
  })

  it("TC-13: a write-mode call that changes nothing succeeds and leaves the stored revision untouched", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(makeTaskDraft({content: "Unchanged"}))
    })

    try {
      const agent = bindAgent(seeded.store)
      const tasks = await runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) =>
        ctx.core.tasksService.getTaskList({includeBacklog: true}),
      )

      expect(tasks.some((task) => task.content === "Unchanged")).toBe(true)
      expect(readRevision(seeded.store)).toBe(seeded.revision)
    } finally {
      seeded.close()
    }
  })

  it("TC-14: two write-mode calls started at once against one store both land, each as its own revision", async () => {
    const seeded = await seedAgentStore()

    try {
      const agentA = bindAgent(seeded.store, "Mac A")
      const agentB = bindAgent(seeded.store, "Mac B")

      await Promise.all([
        runInAgentWorkspace({store: seeded.store}, agentA, "write", async (ctx) => {
          await ctx.core.tasksService.createTask(makeTaskDraft({content: "From A"}))
        }),
        runInAgentWorkspace({store: seeded.store}, agentB, "write", async (ctx) => {
          await ctx.core.tasksService.createTask(makeTaskDraft({content: "From B"}))
        }),
      ])

      const stored = readSnapshot(seeded.store)!
      expect(stored.revision).toBe(String(Number(seeded.revision) + 2))

      const contents = (stored.document.docs as any).tasks.map((task: any) => task.content)
      expect(contents).toEqual(expect.arrayContaining(["From A", "From B"]))
    } finally {
      seeded.close()
    }
  })

  it("TC-15: a stored snapshot newer than this build refuses a read and a write with SERVER_TOO_OLD", async () => {
    const bare = openBareStore()

    try {
      const someDeviceId = bindDevice(bare.store, "Some Mac")
      writeSnapshotIfUnchanged(bare.store, rawSnapshotDocument({version: KNOWN_SNAPSHOT_VERSION + 1}), null, someDeviceId)

      const agent = bindAgent(bare.store)
      const expected = {
        code: AgentToolErrorCode.SERVER_TOO_OLD,
        message: "This server is older than the data on your Macs. Upgrade the Daily Sync Server, then try again.",
      }

      await expect(runInAgentWorkspace({store: bare.store}, agent, "read", async () => null)).rejects.toMatchObject(expected)
      await expect(runInAgentWorkspace({store: bare.store}, agent, "write", async () => null)).rejects.toMatchObject(expected)
    } finally {
      bare.close()
    }
  })

  it("TC-5: a stored snapshot at version 8 refuses a write-mode call with SNAPSHOT_TOO_OLD, revision unchanged", async () => {
    const bare = openBareStore()

    try {
      const someDeviceId = bindDevice(bare.store, "Some Mac")
      const revision = writeSnapshotIfUnchanged(bare.store, rawSnapshotDocument({version: 8}), null, someDeviceId)

      const agent = bindAgent(bare.store)
      await expect(runInAgentWorkspace({store: bare.store}, agent, "write", async () => null)).rejects.toMatchObject({
        code: AgentToolErrorCode.SNAPSHOT_TOO_OLD,
      })

      expect(readRevision(bare.store)).toBe(revision)
    } finally {
      bare.close()
    }
  })

  it("TC-16: a stored snapshot older than this build answers a read normally and refuses a write with SNAPSHOT_TOO_OLD, revision unchanged", async () => {
    const bare = openBareStore()

    try {
      const someDeviceId = bindDevice(bare.store, "Some Mac")
      const revision = writeSnapshotIfUnchanged(bare.store, rawSnapshotDocument({version: KNOWN_SNAPSHOT_VERSION - 1}), null, someDeviceId)

      const agent = bindAgent(bare.store)
      const tasks = await runInAgentWorkspace({store: bare.store}, agent, "read", async (ctx) =>
        ctx.core.tasksService.getTaskList({includeBacklog: true}),
      )
      expect(tasks).toEqual([])

      await expect(runInAgentWorkspace({store: bare.store}, agent, "write", async () => null)).rejects.toMatchObject({
        code: AgentToolErrorCode.SNAPSHOT_TOO_OLD,
        message:
          "The data on this server is older than this server understands. Update Daily on your Macs and let one of them sync before changing anything.",
      })

      expect(readRevision(bare.store)).toBe(revision)
    } finally {
      bare.close()
    }
  })

  it("TC-17: a server holding no snapshot refuses a read and a write with NO_DATA_YET", async () => {
    const bare = openBareStore()

    try {
      const agent = bindAgent(bare.store)
      const expected = {
        code: AgentToolErrorCode.NO_DATA_YET,
        message: "This server has no Daily data yet. Open Daily on a Mac bound to it and let it sync once, then try again.",
      }

      await expect(runInAgentWorkspace({store: bare.store}, agent, "read", async () => null)).rejects.toMatchObject(expected)
      await expect(runInAgentWorkspace({store: bare.store}, agent, "write", async () => null)).rejects.toMatchObject(expected)
    } finally {
      bare.close()
    }
  })

  it("TC-18: a stored document that passes the server's weak check but is not a loadable snapshot refuses SNAPSHOT_UNREADABLE, revision unchanged", async () => {
    const bare = openBareStore()

    try {
      const someDeviceId = bindDevice(bare.store, "Some Mac")
      const revision = writeSnapshotIfUnchanged(
        bare.store,
        rawSnapshotDocument({docs: {tasks: "not-an-array", tags: [], branches: [], milestones: [], relations: [], files: [], events: []}}),
        null,
        someDeviceId,
      )

      const agent = bindAgent(bare.store)
      await expect(runInAgentWorkspace({store: bare.store}, agent, "read", async () => null)).rejects.toMatchObject({
        code: AgentToolErrorCode.SNAPSHOT_UNREADABLE,
      })

      expect(readRevision(bare.store)).toBe(revision)
    } finally {
      bare.close()
    }
  })

  it("TC-19: an agent time zone the runtime does not recognise refuses INVALID_TIME_ZONE rather than answering in UTC", async () => {
    const seeded = await seedAgentStore()

    try {
      const agent = {...bindAgent(seeded.store), timeZone: "Not/AZone"}

      await expect(runInAgentWorkspace({store: seeded.store}, agent, "read", async () => null)).rejects.toMatchObject({
        code: AgentToolErrorCode.INVALID_TIME_ZONE,
      })
    } finally {
      seeded.close()
    }
  })

  it("TC-20: a write-mode call leaves the stored snapshot's version exactly as it found it", async () => {
    const seeded = await seedAgentStore()

    try {
      const before = readSnapshot(seeded.store)!.version
      const agent = bindAgent(seeded.store)

      await runInAgentWorkspace({store: seeded.store}, agent, "write", async (ctx) => {
        await ctx.core.tasksService.createTask(makeTaskDraft({content: "Version check"}))
      })

      expect(readSnapshot(seeded.store)!.version).toBe(before)
    } finally {
      seeded.close()
    }
  })
})
