import {beforeEach, expect, it, vi} from "vitest"

import {setupStorageIPC} from "../../src/main/setup/ipc/storage"

import type {IStorageController} from "@daily/core"

const {handlers} = vi.hoisted(() => ({handlers: new Map<string, (...args: any[]) => unknown>()}))

vi.mock("electron", () => ({ipcMain: {handle: vi.fn((channel, handler) => handlers.set(channel, handler))}}))

beforeEach(() => handlers.clear())

it("proposal conflicts retain the current workflow across IPC serialization", async () => {
  const current = {revision: "current-revision", proposals: [{id: "proposal-1", status: "rejected"}]}
  const storage = {
    resolveTaskWorkflowProposal: vi.fn().mockRejectedValue(
      Object.assign(new Error("The proposal has changed. Reload and review it again."), {
        code: "stale_revision",
        current,
      }),
    ),
  }
  setupStorageIPC(() => storage as unknown as IStorageController)

  const result = await handlers.get("workflow:resolve-proposal")?.({}, {taskId: "task-1", proposalId: "proposal-1", decision: "accepted"})

  expect(JSON.parse(JSON.stringify(result ?? null))).toEqual({
    ok: false,
    code: "stale_revision",
    message: "The proposal has changed. Reload and review it again.",
    current,
  })
})
