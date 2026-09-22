// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    branchId: "main",
    milestoneId: null,
    status: "active",
    content: "task",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-01-01", time: "09:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("TaskCard — the metrics row", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(task, counts = {}) {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {useTaskCommentsStore} = await import("../../../../src/renderer/src/stores/taskComments.store")

    useTaskCommentsStore().commentCounts = counts

    wrapper = mount(TaskCard, {props: {task}, global: {directives: {tooltip: {}}}})
    await nextTick()
    return wrapper
  }

  function footerText() {
    const footer = wrapper.find(".gap-2.text-xs")
    return footer.exists() ? footer.text().replace(/\s+/g, " ").trim() : null
  }

  it("counts_a_tasks_comments_even_when_it_carries_no_estimate", async () => {
    await setup(makeTask(), {"task-1": 3})

    expect(wrapper.find('use[href="#message"]').exists()).toBe(true)
    expect(footerText()).toBe("3")
  })

  it("shows_the_estimate_the_time_spent_and_the_comment_count_together", async () => {
    await setup(makeTask({estimatedTime: 7200, spentTime: 2700}), {"task-1": 2})

    expect(footerText()).toBe("2 h.45 min.2")
  })

  it("draws_no_footer_for_a_task_with_neither_an_estimate_nor_a_comment", async () => {
    await setup(makeTask(), {"another-task": 5})

    expect(wrapper.find('use[href="#message"]').exists()).toBe(false)
    expect(footerText()).toBeNull()
  })
})
