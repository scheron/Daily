// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "active",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeSearchResult(overrides = {}) {
  return {
    task: makeTask(),
    branch: null,
    matches: [],
    score: 0,
    ...overrides,
  }
}

describe("SearchResultItem", () => {
  it("leaves_TC-2_the_head_untouched_while_five_more_previews_mount", async () => {
    const {default: SearchResultItem} = await import("../../../src/renderer/src/ui/overlays/SearchModal/{fragments}/SearchResultItem.vue")

    const first = mount(SearchResultItem, {
      attachTo: document.body,
      props: {result: makeSearchResult({task: makeTask({id: "task-0"})})},
    })
    await nextTick()

    const headMutations = []
    const headObserver = new MutationObserver((records) => headMutations.push(...records))
    headObserver.observe(document.head, {childList: true, characterData: true, subtree: true})

    const rest = Array.from({length: 5}, (_, index) =>
      mount(SearchResultItem, {
        attachTo: document.body,
        props: {result: makeSearchResult({task: makeTask({id: `task-${index + 1}`})})},
      }),
    )
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve))
    headMutations.push(...headObserver.takeRecords())
    headObserver.disconnect()

    expect(headMutations).toHaveLength(0)

    first.unmount()
    rest.forEach((wrapper) => wrapper.unmount())
  })
})
