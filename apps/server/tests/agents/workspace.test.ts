import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it, vi} from "vitest"

import {KNOWN_SNAPSHOT_VERSION} from "@daily/core/utils/sync/snapshot/assertKnownSnapshotVersion"
import {buildSnapshot} from "@daily/core/utils/sync/snapshot/buildSnapshot"
import {ToolErrorCode} from "@daily/tools"

import {AGENT_WRITE_ATTEMPTS, runInAgentWorkspace} from "../../src/agents/AgentWorkspace"
import {runAgentTool} from "../../src/agents/runAgentTool"
import {readRevision, readSnapshot, writeSnapshotIfUnchanged} from "../../src/snapshot/SnapshotStore"
import {openServerStore} from "../../src/store/instance"
import {bindAgent, bindDevice, makeTaskDraft, openMacCore, rawSnapshotDocument, seedAgentStore, writeMacSnapshot} from "./helpers"

import type * as SnapshotStore from "../../src/snapshot/SnapshotStore"
import type {ServerStore} from "../../src/store/instance"

vi.mock("../../src/snapshot/SnapshotStore", async (importOriginal) => {
  const actual = await importOriginal<typeof SnapshotStore>()
  return {...actual, writeSnapshotIfUnchanged: vi.fn(actual.writeSnapshotIfUnchanged)}
})

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
  it("an exhausted workflow snapshot conflict returns current task state without persisting the failed operation", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      taskId = (await mac.core.tasksService.createTask(makeTaskDraft()))!.id
    })
    const actual = await vi.importActual<typeof SnapshotStore>("../../src/snapshot/SnapshotStore")
    try {
      const agent = bindAgent(seeded.store)
      const deps = {store: seeded.store}
      const before = await runInAgentWorkspace(deps, agent, "read", (ctx) => ctx.workStorage.getTaskWorkflow(taskId))
      const rivalSnapshots = []
      for (let attempt = 1; attempt <= 3; attempt++) {
        await seeded.mac.core.tasksService.createTask(makeTaskDraft({content: `Unrelated task ${attempt}`}))
        rivalSnapshots.push(buildSnapshot(await seeded.mac.core.localAdapter.loadAllDocs()))
      }

      let attempts = 0
      vi.mocked(writeSnapshotIfUnchanged).mockImplementation((store, document, revision, deviceId) => {
        actual.writeSnapshotIfUnchanged(store, rivalSnapshots[attempts++], revision, seeded.deviceId)
        return actual.writeSnapshotIfUnchanged(store, document, revision, deviceId)
      })

      const outcome = await runAgentTool(deps, agent, {
        name: "update_task_workflow",
        input: {taskId, operationId: "uncommitted-start", expectedRevision: before.revision, kind: "start", sessionId: "working"},
      })

      expect(attempts).toBe(3)
      expect(readRevision(seeded.store)).toBe(String(Number(seeded.revision) + 3))
      const after = await runInAgentWorkspace(deps, agent, "read", (ctx) => ctx.workStorage.getTaskWorkflow(taskId))
      expect(after.records).toEqual([])
      expect(after.confirmedSeconds).toBe(0)
      expect(outcome).toMatchObject({
        ok: false,
        error: {code: ToolErrorCode.WRITE_CONFLICT, current: {task: {id: taskId}, revision: before.revision, records: []}},
      })
    } finally {
      vi.mocked(writeSnapshotIfUnchanged).mockImplementation(actual.writeSnapshotIfUnchanged)
      seeded.close()
    }
  })

  it("a workflow heartbeat retried after a snapshot race credits only time observed at request entry", async () => {
    let taskId = ""
    const seeded = await seedAgentStore(async (mac) => {
      taskId = (await mac.core.tasksService.createTask(makeTaskDraft()))!.id
    })
    try {
      const agent = bindAgent(seeded.store)
      let now = 1000
      let monotonic = 0
      const deps = {store: seeded.store, now: () => new Date(now), monotonicNow: () => monotonic}
      const start = await runInAgentWorkspace(deps, agent, "write", async (ctx) => {
        const state = await ctx.workStorage.getTaskWorkflow(taskId)
        return ctx.workStorage.executeTaskWorkflow(
          {taskId, operationId: "start", expectedRevision: state.revision, kind: "start", sessionId: "working"},
          {actorId: ctx.workflowActorId, source: ctx.source},
        )
      })
      now = 11000
      monotonic = 10000
      let first = true
      const heartbeat = await runInAgentWorkspace(deps, agent, "write", async (ctx) => {
        const receipt = await ctx.workStorage.executeTaskWorkflow(
          {taskId, operationId: "heartbeat", expectedRevision: start.revision, kind: "heartbeat", sessionId: "working"},
          {actorId: ctx.workflowActorId, source: ctx.source},
        )
        if (first) {
          first = false
          const stored = readSnapshot(seeded.store)!
          writeSnapshotIfUnchanged(seeded.store, stored.document, stored.revision, seeded.deviceId)
          now = 21000
          monotonic = 20000
        }
        return receipt
      })
      expect(heartbeat.confirmedSeconds).toBe(10)
      const state = await runInAgentWorkspace(deps, agent, "read", (ctx) => ctx.workStorage.getTaskWorkflow(taskId))
      expect(state.confirmedSeconds).toBe(10)
      expect(state.records.find((record) => record.command.operationId === "heartbeat")?.createdAt).toBe(11000)
    } finally {
      seeded.close()
    }
  })
  it("TC-9: a read-mode call sees the stored snapshot's tasks and leaves the stored revision unchanged", async () => {
    const seeded = await seedAgentStore(async (mac) => {
      await mac.core.tasksService.createTask(makeTaskDraft({content: "Buy milk"}))
    })

    try {
      const agent = bindAgent(seeded.store)
      const tasks = await runInAgentWorkspace({store: seeded.store}, agent, "read", async (ctx) =>
        ctx.workStorage.getTaskList({includeBacklog: true}),
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
        await ctx.workStorage.createTask(makeTaskDraft({content: "Added by the agent"}))
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

        await ctx.workStorage.createTask(makeTaskDraft({content: "Agent task"}))
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

          await ctx.workStorage.createTask(makeTaskDraft({content: "Agent task"}))
        }),
      ).rejects.toMatchObject({code: ToolErrorCode.WRITE_CONFLICT})

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
        ctx.workStorage.getTaskList({includeBacklog: true}),
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
          await ctx.workStorage.createTask(makeTaskDraft({content: "From A"}))
        }),
        runInAgentWorkspace({store: seeded.store}, agentB, "write", async (ctx) => {
          await ctx.workStorage.createTask(makeTaskDraft({content: "From B"}))
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
        code: ToolErrorCode.SERVER_TOO_OLD,
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
        code: ToolErrorCode.SNAPSHOT_TOO_OLD,
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
      const tasks = await runInAgentWorkspace({store: bare.store}, agent, "read", async (ctx) => ctx.workStorage.getTaskList({includeBacklog: true}))
      expect(tasks).toEqual([])

      await expect(runInAgentWorkspace({store: bare.store}, agent, "write", async () => null)).rejects.toMatchObject({
        code: ToolErrorCode.SNAPSHOT_TOO_OLD,
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
        code: ToolErrorCode.NO_DATA_YET,
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
        code: ToolErrorCode.SNAPSHOT_UNREADABLE,
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
        code: ToolErrorCode.INVALID_TIME_ZONE,
        message: 'Unknown time zone "Not/AZone". This server cannot tell which day it is on that Mac.',
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
        await ctx.workStorage.createTask(makeTaskDraft({content: "Version check"}))
      })

      expect(readSnapshot(seeded.store)!.version).toBe(before)
    } finally {
      seeded.close()
    }
  })
})
