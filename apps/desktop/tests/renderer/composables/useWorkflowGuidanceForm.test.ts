import {effectScope, nextTick, ref} from "vue"
import {afterEach, expect, it, vi} from "vitest"

import {useWorkflowGuidanceForm} from "../../../src/renderer/src/ui/common/(editors)/WorkflowGuidanceEditor/composables/useWorkflowGuidanceForm"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeWorkflowGuidance} from "../../helpers/workflowFixtures"

import type {WorkflowGuidance, WorkflowGuidanceScope} from "@daily/protocol"

const scopes: ReturnType<typeof effectScope>[] = []

afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

function mountForm(value: WorkflowGuidanceScope = {kind: "workspace"}) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useWorkflowGuidanceForm(ref(value)))!
}

function makeProjectGuidance(): WorkflowGuidance {
  return {
    ...makeWorkflowGuidance("Original workspace instructions"),
    project: {
      scope: {kind: "project", projectId: "main"},
      content: "Project instructions",
      allowCompletion: null,
      revision: "project-1",
      history: [],
    },
  }
}

it("storage changes refresh a clean guidance form and its effective completion permission", async () => {
  const listeners = new Set<() => void>()
  let current = makeWorkflowGuidance("Original instructions")
  mockBridgeIPC({
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "storage:changed") listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    "workflow:get-guidance": vi.fn(async () => ({ok: true, value: current})),
  })
  const form = mountForm()
  await nextTick()
  await Promise.resolve()
  current = {
    ...makeWorkflowGuidance("Updated instructions"),
    workspace: {...current.workspace, content: "Updated instructions", allowCompletion: true, revision: "revision-2"},
    allowCompletion: true,
  }
  listeners.forEach((listener) => listener())
  await nextTick()
  await Promise.resolve()

  expect({
    content: form.content.value,
    permission: form.effectiveAllowCompletion.value,
    revision: form.document.value?.revision,
    dirty: form.isDirty.value,
  }).toEqual({content: "Updated instructions", permission: true, revision: "revision-2", dirty: false})
})

it("workspace guidance refreshes beneath a dirty project draft without changing its save revision", async () => {
  const listeners = new Set<() => void>()
  let current = makeProjectGuidance()
  const bridge = mockBridgeIPC({
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "storage:changed") listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    "workflow:get-guidance": vi.fn(async () => ({ok: true, value: current})),
    "workflow:save-guidance": vi.fn().mockResolvedValue({
      ok: true,
      value: {...current.project, content: "Keep this local project draft", revision: "project-2"},
    }),
  })
  const form = mountForm({kind: "project", projectId: "main"})
  await nextTick()
  await Promise.resolve()
  form.content.value = "Keep this local project draft"
  current = {
    ...current,
    workspace: {...current.workspace, content: "Updated workspace instructions", allowCompletion: true, revision: "revision-2"},
    allowCompletion: true,
  }
  listeners.forEach((listener) => listener())
  await nextTick()
  await Promise.resolve()

  expect({
    draft: form.content.value,
    workspace: form.guidance.value?.workspace.content,
    permission: form.effectiveAllowCompletion.value,
    revision: form.document.value?.revision,
    dirty: form.isDirty.value,
  }).toEqual({
    draft: "Keep this local project draft",
    workspace: "Updated workspace instructions",
    permission: true,
    revision: "project-1",
    dirty: true,
  })
  await form.save()
  expect(bridge["workflow:save-guidance"].mock.calls[0][0].expectedRevision).toBe("project-1")
  expect(form.refreshNotice.value).toBeNull()
})

it("a changed saved document preserves a dirty draft and blocks saving with its old revision", async () => {
  const listeners = new Set<() => void>()
  let current = makeWorkflowGuidance("Original instructions")
  mockBridgeIPC({
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "storage:changed") listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    "workflow:get-guidance": vi.fn(async () => ({ok: true, value: current})),
  })
  const form = mountForm()
  await nextTick()
  await Promise.resolve()
  form.content.value = "Keep this local draft"
  current = {...current, workspace: {...current.workspace, content: "Peer instructions", revision: "revision-2"}}
  listeners.forEach((listener) => listener())
  await nextTick()
  await Promise.resolve()

  expect({draft: form.content.value, revision: form.document.value?.revision, conflict: form.hasConflict.value}).toEqual({
    draft: "Keep this local draft",
    revision: "revision-1",
    conflict: true,
  })
  expect(await form.save()).toBe(false)
})

it("a refresh started before saving cannot replace the confirmed saved document", async () => {
  const listeners = new Set<() => void>()
  const original = makeWorkflowGuidance("Original instructions")
  const savedDocument = {...original.workspace, content: "Confirmed local instructions", revision: "revision-2"}
  const pending = {complete(_result: {ok: boolean; value: WorkflowGuidance}) {}}
  const delayed = new Promise((resolve) => (pending.complete = resolve))
  mockBridgeIPC({
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "storage:changed") listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    "workflow:get-guidance": vi
      .fn()
      .mockResolvedValueOnce({ok: true, value: structuredClone(original)})
      .mockReturnValueOnce(delayed),
    "workflow:save-guidance": vi.fn().mockResolvedValue({ok: true, value: savedDocument}),
  })
  const form = mountForm()
  await nextTick()
  await Promise.resolve()
  form.content.value = "Confirmed local instructions"
  listeners.forEach((listener) => listener())
  expect(await form.save()).toBe(true)
  pending.complete({ok: true, value: original})
  await nextTick()
  await Promise.resolve()

  expect({content: form.content.value, revision: form.document.value?.revision, dirty: form.isDirty.value}).toEqual({
    content: "Confirmed local instructions",
    revision: "revision-2",
    dirty: false,
  })
})

it("a stale guidance save preserves the draft and requires reviewing current guidance", async () => {
  const guidance = makeWorkflowGuidance("Original instructions")
  mockBridgeIPC({
    "workflow:get-guidance": vi.fn().mockResolvedValue({ok: true, value: guidance}),
    "workflow:save-guidance": vi
      .fn()
      .mockResolvedValue({ok: false, code: "stale_revision", message: "Guidance changed on another device.", current: null}),
  })
  const form = mountForm()
  await nextTick()
  await Promise.resolve()
  form.content.value = "Keep my unsaved instructions"
  await form.save()

  expect({content: form.content.value, conflict: form.hasConflict.value, dirty: form.isDirty.value}).toEqual({
    content: "Keep my unsaved instructions",
    conflict: true,
    dirty: true,
  })
  expect(form.error.value).toContain("Guidance changed")
})
