import {createPinia, disposePinia, setActivePinia} from "pinia"
import {expect, it, vi} from "vitest"

import {flushPromises, mount} from "@vue/test-utils"
import TaskWorkflow from "../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/TaskWorkflow"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {makeTaskWorkflow, makeTaskWorkflowProposal} from "../../../helpers/workflowFixtures"

import type {Tag} from "@daily/protocol"

it("proposal history distinguishes unavailable originals from known empty, active, tagged and deleted values", async () => {
  function makeTag(overrides: Partial<Tag> = {}): Tag {
    return {
      id: "tag-1",
      branchId: "main",
      name: "Tag",
      color: "blue",
      createdAt: "2030-01-01T00:00:00Z",
      updatedAt: "2030-01-01T00:00:00Z",
      deletedAt: null,
      ...overrides,
    }
  }

  const changes = {tags: [], deletedAt: null}
  const workflow = makeTaskWorkflow({
    proposals: [
      makeTaskWorkflowProposal({id: "legacy", changes, originalValues: {}, conflict: true}),
      makeTaskWorkflowProposal({id: "known-empty", changes, originalValues: {tags: [], deletedAt: null}}),
      makeTaskWorkflowProposal({
        id: "known-values",
        changes,
        originalValues: {tags: [makeTag({name: "Original tag"})], deletedAt: "2030-01-02T03:04:05Z"},
      }),
    ],
  })
  mockBridgeIPC({"workflow:get-task": vi.fn().mockResolvedValue({ok: true, value: workflow})})
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(TaskWorkflow, {props: {taskId: workflow.task.id}, global: {directives: {tooltip: {}}}})
  try {
    await flushPromises()

    const rows = wrapper.findAll("tbody").map((body) => body.findAll("tr").map((row) => row.findAll("th, td").map((cell) => cell.text())))
    expect(rows).toEqual([
      [
        ["Tags", "Original tag", "No tags"],
        ["Availability", "Deleted · 2030-01-02T03:04:05Z", "Active (restored)"],
      ],
      [
        ["Tags", "No tags", "No tags"],
        ["Availability", "Active", "Active (restored)"],
      ],
      [
        ["Tags", "Original value unavailable", "No tags"],
        ["Availability", "Original value unavailable", "Active (restored)"],
      ],
    ])
  } finally {
    wrapper.unmount()
    disposePinia(pinia)
  }
})
