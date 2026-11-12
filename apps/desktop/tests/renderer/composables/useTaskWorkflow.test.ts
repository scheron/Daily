import {effectScope, nextTick, ref} from "vue"
import {afterEach, expect, it, vi} from "vitest"

import {useTaskWorkflow} from "../../../src/renderer/src/ui/modules/RightPanel/{fragments}/TaskWorkflow/composables/useTaskWorkflow"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeTaskWorkflow, makeTaskWorkflowProposal} from "../../helpers/workflowFixtures"

const scopes: ReturnType<typeof effectScope>[] = []

afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

it("a conflicting proposal decision refreshes its persisted state and keeps the conflict visible", async () => {
  const current = makeTaskWorkflow({revision: "latest", proposals: [makeTaskWorkflowProposal({status: "rejected"})]})
  mockBridgeIPC({
    on: vi.fn(() => vi.fn()),
    "workflow:get-task": vi.fn().mockResolvedValue({ok: true, value: makeTaskWorkflow()}),
    "workflow:resolve-proposal": vi
      .fn()
      .mockResolvedValue({ok: false, code: "stale_revision", message: "Another device rejected this proposal.", current}),
  })
  const scope = effectScope()
  scopes.push(scope)
  const workflow = scope.run(() => useTaskWorkflow(ref("task-1")))!
  await nextTick()
  await Promise.resolve()
  await workflow.review("proposal-1", "accepted")

  expect(workflow.state.value?.proposals).toMatchObject([{id: "proposal-1", status: "rejected", conflict: false}])
  expect(workflow.error.value).toContain("Another device rejected")
})

it("a failed refresh marks cached session reports as unconfirmed", async () => {
  const bridge = mockBridgeIPC({
    on: vi.fn(() => vi.fn()),
    "workflow:get-task": vi.fn().mockResolvedValue({ok: true, value: makeTaskWorkflow()}),
  })
  const scope = effectScope()
  scopes.push(scope)
  const workflow = scope.run(() => useTaskWorkflow(ref("task-1")))!
  await nextTick()
  await Promise.resolve()
  bridge["workflow:get-task"].mockRejectedValueOnce(new Error("Disconnected"))
  await workflow.load(true)

  expect(workflow.state.value?.revision).toBe("original")
  expect(workflow.isStale.value).toBe(true)
})

it("a successful quiet refresh clears an obsolete refresh failure", async () => {
  const bridge = mockBridgeIPC({
    on: vi.fn(() => vi.fn()),
    "workflow:get-task": vi.fn().mockResolvedValue({ok: true, value: makeTaskWorkflow()}),
  })
  const scope = effectScope()
  scopes.push(scope)
  const workflow = scope.run(() => useTaskWorkflow(ref("task-1")))!
  await nextTick()
  await Promise.resolve()
  bridge["workflow:get-task"].mockRejectedValueOnce(new Error("Disconnected"))
  await workflow.load(true)
  await workflow.load(true)

  expect({stale: workflow.isStale.value, error: workflow.error.value}).toEqual({stale: false, error: null})
})
