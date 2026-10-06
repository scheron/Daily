// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it} from "vitest"

import {toDateLabel} from "@daily/std"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../../helpers/bridgeIPC"
import {installFakeResizeObserver, stubLayout} from "../../../helpers/resizeObserver"

const {deliverResize} = installFakeResizeObserver()

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

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
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

  it("shows_the_time_spent_alone_when_the_task_carries_no_estimate", async () => {
    await setup(makeTask({spentTime: 2700}))

    const icons = wrapper
      .find(".gap-2.text-xs")
      .findAll("use")
      .map((icon) => icon.attributes("href"))
    expect(icons).toEqual(["#check-check"])
    expect(footerText()).toBe("45 min.")
  })

  it("offers_the_time_spent_action_on_a_task_with_no_estimate", async () => {
    await setup(makeTask())

    const items = wrapper.findComponent({name: "BaseContextMenu"}).props("items")
    const timeSpent = items.find((item) => item.value === "time-spent")
    expect(timeSpent).toBeDefined()
    expect(timeSpent.disabled).toBeFalsy()
  })

  it("carries_its_milestone_in_the_milestone_frame_too_with_its_date_leading_the_metrics", async () => {
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    useMilestonesStore().milestones = [makeMilestone()]
    useFilterStore().setFrame("milestone")

    await setup(makeTask({milestoneId: "milestone-1", estimatedTime: 3600}))

    const metrics = wrapper.find(".gap-2.text-xs").find(".ml-auto")
    expect(wrapper.find(".ms-chip").text()).toBe("Launch")
    expect(metrics.findAll("use").map((icon) => icon.attributes("href"))).toEqual(["#calendar", "#stopwatch"])
    expect(metrics.text()).toContain(toDateLabel("2026-01-01", {short: true}))
  })

  it("draws_no_footer_for_a_task_with_neither_an_estimate_nor_a_comment", async () => {
    await setup(makeTask(), {"another-task": 5})

    expect(wrapper.find('use[href="#message"]').exists()).toBe(false)
    expect(footerText()).toBeNull()
  })
})

describe("TaskCard — its shape on the board", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("is always the board's card height, with the text between the tag row and a footer pinned last, never clamped by its content", async () => {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {BOARD_CARD_HEIGHT} = await import("../../../../src/renderer/src/constants/ui")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")

    useSettingsStore().settings = {branch: {activeId: "main"}}
    useMilestonesStore().milestones = [makeMilestone()]
    const content = Array.from({length: 40}, (_, index) => `line ${index + 1}`).join("\n")

    wrapper = mount(TaskCard, {
      props: {task: makeTask({milestoneId: "milestone-1", content})},
      attachTo: document.body,
      global: {directives: {tooltip: {}}},
    })
    await nextTick()

    const card = wrapper.element.querySelector("#task-1")
    expect(card.style.height).toBe(`${BOARD_CARD_HEIGHT}px`)

    const markdown = card.querySelector(".markdown-view")
    const text = markdown.parentElement
    const column = text.parentElement
    const footer = card.querySelector(".gap-2.text-xs")
    expect(footer.textContent).toContain("Launch")
    expect(Array.from(column.children)).toEqual([column.children[0], text, footer])
    expect(Array.from(column.classList)).toEqual(expect.arrayContaining(["flex", "flex-col", "h-full"]))
    expect(Array.from(text.classList)).toEqual(expect.arrayContaining(["flex-1", "min-h-0", "overflow-hidden"]))

    const contentEl = markdown.querySelector(".cm-content")
    stubLayout(contentEl, {scrollHeight: 900})
    deliverResize(contentEl)
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await nextTick()

    expect(markdown.classList.contains("is-minimized")).toBe(false)
  })
})

describe("TaskCard — the focus session's border", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  function makeSession(overrides = {}) {
    return {
      phase: "collect",
      mode: "pomodoro-25",
      tasks: [{taskId: "task-1", title: "task", focusedSeconds: 0, isDone: false}],
      currentTaskId: null,
      runStartedAt: null,
      intervalFocusedSeconds: 0,
      completedIntervals: 0,
      isDetached: false,
      ...overrides,
    }
  }

  it("draws the travelling border on a card in the session, and drops it once the task is done or the session reaches its summary", async () => {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {default: FocusBorder} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/FocusBorder.vue")
    const {useFocusStore} = await import("../../../../src/renderer/src/stores/focus.store")

    const focus = useFocusStore()
    focus.session = makeSession()
    wrapper = mount(TaskCard, {props: {task: makeTask()}, global: {directives: {tooltip: {}}}})
    await nextTick()
    expect(wrapper.findComponent(FocusBorder).exists()).toBe(true)

    focus.session = makeSession({
      phase: "focus",
      currentTaskId: "task-1",
      tasks: [{taskId: "task-1", title: "task", focusedSeconds: 60, isDone: true}],
    })
    await nextTick()
    expect(wrapper.findComponent(FocusBorder).exists()).toBe(false)

    focus.session = makeSession({phase: "summary"})
    await nextTick()
    expect(wrapper.findComponent(FocusBorder).exists()).toBe(false)
  })
})

describe("TaskCard — the project name in All projects mode", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(isAllProjects, task = makeTask({branchId: "leki", tags: [{id: "tag-1", name: "work", color: "#000", branchId: "leki"}]})) {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    const {useTagsStore} = await import("../../../../src/renderer/src/stores/tags.store")

    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    settingsStore.settings = {branch: {activeId: "main", isAllProjects}, layout: {sectionsCollapsed: {}}}
    useBranchesStore().branches = [{id: "leki", name: "Leki"}]
    useTagsStore().tags = [{id: "tag-1", name: "work", color: "#000", branchId: "leki"}]

    wrapper = mount(TaskCard, {props: {task}, global: {directives: {tooltip: {}}}})
    await nextTick()
  }

  it("leads_the_top_row_with_the_project_icon_and_name_in_the_mode", async () => {
    const {default: DynamicTagsPanel} = await import("../../../../src/renderer/src/ui/common/misc/DynamicTagsPanel.vue")
    await setup(true)

    const top = wrapper.find(".flex.w-full.items-center.gap-3")
    const label = top.find('[title="Leki"]')
    const tagsPanel = top.findComponent(DynamicTagsPanel)
    expect(label.find('use[href="#project"]').exists()).toBe(true)
    expect(label.text()).toBe("Leki")
    expect(tagsPanel.text()).toContain("work")
    expect(label.element.compareDocumentPosition(tagsPanel.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("draws_no_tags_placeholder_for_a_task_without_tags_and_keeps_the_project_label_leading", async () => {
    await setup(true, makeTask({branchId: "leki"}))

    const top = wrapper.find(".flex.w-full.items-center.gap-3")
    expect(wrapper.text()).not.toContain("No tags")
    expect(wrapper.find('use[href="#tags"]').exists()).toBe(false)
    expect(top.find('[title="Leki"]').text()).toBe("Leki")
  })

  it("still_draws_the_tags_of_a_task_that_has_them", async () => {
    await setup(false)

    expect(wrapper.text()).toContain("work")
    expect(wrapper.text()).not.toContain("No tags")
  })

  it("draws_no_project_out_of_the_mode", async () => {
    await setup(false)

    expect(wrapper.find('use[href="#project"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Leki")
  })
})

describe("TaskCard — the relation chip", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("shows_the_icon_and_the_count_only_with_the_full_text_in_the_tooltip", async () => {
    const {default: RelationChip} =
      await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/RelationChip.vue")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    const {useTaskRelationsStore} = await import("../../../../src/renderer/src/stores/taskRelations.store")

    useTasksStore().tasks = [makeTask({id: "A"}), makeTask({id: "B"}), makeTask({id: "C"})]
    useTaskRelationsStore().relations = [
      {blockerId: "B", blockedId: "A"},
      {blockerId: "C", blockedId: "A"},
    ]

    const tips = []
    wrapper = mount(RelationChip, {
      props: {taskId: "A"},
      global: {directives: {tooltip: {mounted: (_el, binding) => tips.push(binding.value)}}},
    })

    expect(wrapper.find('use[href="#alert-triangle"]').exists()).toBe(true)
    expect(wrapper.text()).toBe("2")
    expect(tips).toEqual(["Blocked by 2"])
  })
})
