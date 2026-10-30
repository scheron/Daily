import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it, onTestFinished} from "vitest"

import {createStorageCore, dataPaths, StorageController} from "@daily/core"

import {createTestDatabase} from "../../../../../packages/core/tests/helpers/db"
import {DEMO_TASK_IDS, seedDemoStorage} from "../../../src/main/demo/seedDemoStorage"

describe("demo workspace", () => {
  it("creates a complete fictional workspace once and leaves later edits alone", async () => {
    const storage = makeStorage()
    await storage.workStorage.initializeIndex()
    await seedDemoStorage(storage, "2026-10-31")

    const tasks = await storage.getAllTasks()
    const settings = await storage.loadSettings()
    expect(new Set(tasks.map((task) => task.status))).toEqual(
      new Set(["backlog", "todo", "in_progress", "ready_for_agent", "ready_to_merge", "done", "cancelled"]),
    )
    expect((await storage.getBranchList()).map((project) => project.name)).toEqual(expect.arrayContaining(["Orbit", "Field Notes", "Personal"]))
    expect(tasks.some((task) => task.scheduled?.date === "2026-10-30" && task.status === "done" && task.spentTime > 0)).toBe(true)
    expect((await storage.getSubtasksOfTask(DEMO_TASK_IDS.onboarding)).filter((subtask) => subtask.done)).toHaveLength(2)
    expect(await storage.getTaskComments(DEMO_TASK_IDS.onboarding)).toHaveLength(2)
    const agentReview = await storage.getTask(DEMO_TASK_IDS.agentReview)
    const agentComments = await storage.getTaskComments(DEMO_TASK_IDS.agentReview)
    expect(agentReview?.status).toBe("ready_to_merge")
    expect(agentComments.map(({kind, provider}) => ({kind, provider}))).toEqual([
      {kind: "mcp", provider: "Codex"},
      {kind: "mcp", provider: "Claude Code"},
    ])
    expect(agentComments[0]?.content).toContain("Demo implementation note")
    expect(agentComments[0]?.content).toContain("```ts")
    expect(agentComments[0]?.content).toContain("[review](https://example.com/orbit/review)")
    expect(agentComments[1]?.content).toContain("- [x]")
    expect(agentComments[1]?.content).toContain("- [ ] Final merge approval")
    expect((await storage.getTaskRelations(DEMO_TASK_IDS.release)).blockedBy.map((task) => task.id)).toEqual([DEMO_TASK_IDS.onboarding])
    expect((await storage.searchTasks("onboarding")).map((result) => result.task.id)).toContain(DEMO_TASK_IDS.onboarding)
    expect(settings.appearance.mode).toBe("light")
    expect(settings.quickTask.isEnabled).toBe(false)
    expect(settings.ai).toBeNull()
    expect(settings.sync.iCloud.enabled).toBe(false)
    expect(settings.sync.server.enabled).toBe(false)

    await storage.updateTask(DEMO_TASK_IDS.onboarding, {content: "# A later demo edit"})
    await seedDemoStorage(storage, "2026-11-01")
    expect(await storage.getAllTasks()).toHaveLength(tasks.length)
    expect((await storage.getTask(DEMO_TASK_IDS.onboarding))?.content).toBe("# A later demo edit")
  })

  it("does not seed a profile that already has a project", async () => {
    const storage = makeStorage()
    await storage.createBranch({name: "Existing project", description: "Keep this project untouched."})
    const settings = await storage.loadSettings()

    await seedDemoStorage(storage, "2026-10-31")

    expect(await storage.getAllTasks()).toEqual([])
    expect(await storage.getBranchList()).toHaveLength(2)
    expect(await storage.loadSettings()).toEqual(settings)
  })
})

function makeStorage(): StorageController {
  const root = mkdtempSync(join(tmpdir(), "daily-demo-test-"))
  const db = createTestDatabase()
  const paths = {...dataPaths(() => root), remoteSyncPath: () => join(root, "remote")}
  const storage = new StorageController(db, paths)
  storage.attachCore(createStorageCore(db, paths))
  onTestFinished(() => {
    db.close()
    rmSync(root, {recursive: true, force: true})
  })
  return storage
}
