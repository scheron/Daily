// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {toDateLabel} from "@daily/std"

import {flushPromises, mount} from "@vue/test-utils"
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
    priority: "none",
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

describe("TaskCard — the footer numbers", () => {
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

  function footer() {
    return wrapper.find(".min-h-5")
  }

  function footerText() {
    return footer().exists() ? footer().text().replace(/\s+/g, " ").trim() : null
  }

  it("counts_a_tasks_comments_even_when_it_carries_no_estimate", async () => {
    await setup(makeTask(), {"task-1": 3})

    expect(wrapper.find('use[href="#message"]').exists()).toBe(true)
    expect(footerText()).toBe("3")
  })

  it("pairs_the_time_spent_with_the_estimate_under_one_stopwatch", async () => {
    await setup(makeTask({estimatedTime: 7200, spentTime: 2700}), {"task-1": 2})

    expect(
      footer()
        .findAll("use")
        .map((icon) => icon.attributes("href")),
    ).toEqual(["#stopwatch", "#message"])
    expect(footerText()).toBe("45m / 2h2")
  })

  it("dashes_the_side_of_the_pair_that_has_no_value", async () => {
    await setup(makeTask({estimatedTime: 7200}))
    expect(footerText()).toBe("– / 2h")
    wrapper.unmount()

    await setup(makeTask({spentTime: 4800}))
    expect(footerText()).toBe("1h 20m / –")
  })

  it("offers_the_time_spent_action_on_a_task_with_no_estimate", async () => {
    await setup(makeTask())

    const items = wrapper.findComponent({name: "BaseContextMenu"}).props("items")
    const timeSpent = items.find((item) => item.value === "time-spent")
    expect(timeSpent).toBeDefined()
    expect(timeSpent.disabled).toBeFalsy()
  })

  it("leads_the_numbers_with_the_day_in_the_milestone_frame_only", async () => {
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    useFilterStore().setFrame("milestone")

    await setup(makeTask({estimatedTime: 3600}))

    expect(
      footer()
        .findAll("use")
        .map((icon) => icon.attributes("href")),
    ).toEqual(["#calendar", "#stopwatch"])
    expect(footerText()).toContain(toDateLabel("2026-01-01", {short: true}))
    wrapper.unmount()

    useFilterStore().setFrame("days")
    await setup(makeTask({estimatedTime: 3600}))
    expect(
      footer()
        .findAll("use")
        .map((icon) => icon.attributes("href")),
    ).toEqual(["#stopwatch"])
  })

  it("draws_a_footer_for_a_task_whose_only_content_is_a_relation", async () => {
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    const {useTaskRelationsStore} = await import("../../../../src/renderer/src/stores/taskRelations.store")
    const blocker = makeTask({id: "task-1"})
    useTasksStore().tasks = [blocker, makeTask({id: "task-2"})]
    useTaskRelationsStore().relations = [{id: "r1", blockerId: "task-1", blockedId: "task-2"}]

    await setup(blocker)

    expect(
      footer()
        .findAll("use")
        .map((icon) => icon.attributes("href")),
    ).toEqual(["#ban"])
    expect(footerText()).toBe("1")
  })

  it("draws_a_footer_with_only_the_priority_icon_for_a_task_that_has_a_priority_and_nothing_else", async () => {
    await setup(makeTask({priority: "high"}))

    expect(footer().exists()).toBe(true)
    expect(footer().find('use[href="#priority-high"]').exists()).toBe(true)
  })

  it("keeps_the_priority_icon_as_the_rightmost_footer_element_after_the_numbers", async () => {
    await setup(makeTask({priority: "high", estimatedTime: 3600}))

    const icon = footer().find('use[href="#priority-high"]').element.closest("svg")
    expect(footer().element.lastElementChild).toBe(icon)
    expect(footerText()).toContain("– / 1h")
  })

  it("draws_no_priority_icon_when_the_priority_is_none", async () => {
    await setup(makeTask({priority: "none"}), {"task-1": 2})

    expect(wrapper.find('use[href^="#priority-"]').exists()).toBe(false)
  })

  it("draws_no_footer_for_a_task_with_neither_tags_nor_numbers", async () => {
    await setup(makeTask(), {"another-task": 5})

    expect(wrapper.find('use[href="#message"]').exists()).toBe(false)
    expect(footerText()).toBeNull()
  })
})

describe("TaskCard — the crumb", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  async function setup(task, {isAllProjects = false, milestone = null} = {}) {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const {useBranchesStore} = await import("../../../../src/renderer/src/stores/branches.store")
    const {useMilestonesStore} = await import("../../../../src/renderer/src/stores/milestones.store")

    const settingsStore = useSettingsStore()
    await new Promise((resolve) => setTimeout(resolve, 20))
    settingsStore.settings = {branch: {activeId: "main", isAllProjects}, layout: {sectionsCollapsed: {}}}
    useBranchesStore().branches = [{id: "leki", name: "Leki"}]
    useMilestonesStore().milestones = milestone ? [milestone] : []

    wrapper = mount(TaskCard, {props: {task}, global: {directives: {tooltip: {}}}})
    await nextTick()
  }

  function crumb() {
    return wrapper.find(".h-4.text-xs")
  }

  it("reads_project_then_milestone_in_all_projects_mode", async () => {
    await setup(makeTask({branchId: "leki", milestoneId: "milestone-1"}), {isAllProjects: true, milestone: makeMilestone({branchId: "leki"})})

    expect(
      crumb()
        .findAll("use")
        .map((icon) => icon.attributes("href")),
    ).toEqual(["#project", "#chevron-right"])
    expect(crumb().find('[title="Leki"]').text()).toBe("Leki")
    expect(crumb().text()).toBe("LekiLaunch")
    expect(crumb().find("svg path").exists()).toBe(true)
  })

  it("shows_only_the_milestone_inside_one_project", async () => {
    await setup(makeTask({branchId: "leki", milestoneId: "milestone-1"}), {milestone: makeMilestone({branchId: "leki"})})

    expect(crumb().text()).toBe("Launch")
    expect(crumb().find('use[href="#project"]').exists()).toBe(false)
  })

  it("shows_only_the_project_when_the_task_has_no_milestone", async () => {
    await setup(makeTask({branchId: "leki"}), {isAllProjects: true})

    expect(crumb().text()).toBe("Leki")
  })

  it("draws_no_crumb_without_a_project_or_a_milestone", async () => {
    await setup(makeTask())

    expect(crumb().exists()).toBe(false)
  })

  it("paints_an_overdue_milestone_in_the_error_colour", async () => {
    await setup(makeTask({milestoneId: "milestone-1"}), {milestone: makeMilestone({targetDate: "2020-01-01"})})

    expect(crumb().find(".text-error").exists()).toBe(true)
  })
})

describe("TaskCard — the status border", () => {
  let wrapper = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("draws_the_status_in_the_border_with_no_badge", async () => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")

    for (const status of ["active", "backlog", "done", "discarded"]) {
      const card = mount(TaskCard, {props: {task: makeTask({status})}, global: {directives: {tooltip: {}}}})
      expect(card.find("use").exists()).toBe(false)
      card.unmount()
    }
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

  it("is always the board's card height, with the crumb first and the text filling the rest, never clamped by its content", async () => {
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
    const crumb = card.querySelector(".h-4.text-xs")
    expect(crumb.textContent).toContain("Launch")
    expect(Array.from(column.children)).toEqual([crumb, text])
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

describe("TaskCard — the tags slot", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("keeps_the_tags_panel_bottom_left_of_the_footer_before_the_numbers", async () => {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {default: TagLine} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/TagLine.vue")
    const {useTagsStore} = await import("../../../../src/renderer/src/stores/tags.store")

    useTagsStore().tags = [{id: "tag-1", name: "work", color: "#000", branchId: "main"}]
    wrapper = mount(TaskCard, {
      props: {task: makeTask({estimatedTime: 3600, tags: [{id: "tag-1", name: "work", color: "#000", branchId: "main"}]})},
      global: {directives: {tooltip: {}}},
    })
    await nextTick()

    const footer = wrapper.find(".min-h-5")
    const panel = footer.findComponent(TagLine)
    expect(panel.text()).toContain("#work")
    expect(footer.element.firstElementChild).toBe(panel.element)
    expect(footer.text()).toContain("– / 1h")
  })

  it("draws_the_footer_for_a_task_with_tags_alone", async () => {
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {useTagsStore} = await import("../../../../src/renderer/src/stores/tags.store")

    useTagsStore().tags = [{id: "tag-1", name: "work", color: "#000", branchId: "main"}]
    wrapper = mount(TaskCard, {
      props: {task: makeTask({tags: [{id: "tag-1", name: "work", color: "#000", branchId: "main"}]})},
      global: {directives: {tooltip: {}}},
    })
    await nextTick()

    expect(wrapper.find(".min-h-5").exists()).toBe(true)
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

describe("TaskCard — compact presentation", () => {
  let wrapper = null
  let bridge

  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
  })

  async function setup(task, fontSize = "normal") {
    const {useSettingsStore} = await import("../../../../src/renderer/src/stores/settings.store")
    const settings = useSettingsStore()
    await flushPromises()
    settings.settings = {appearance: {taskView: "compact"}, typography: {fontSize}, branch: {activeId: "main"}}
    const {default: TaskCard} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    wrapper = mount(TaskCard, {props: {task}, global: {directives: {tooltip: {}}}})
    await nextTick()
    return settings
  }

  it.each([
    ["small", 93.6],
    ["normal", 108],
    ["large", 122.4],
  ])("scales compact space at %s while returning to the original regular height", async (fontSize, height) => {
    const settings = await setup(makeTask(), fontSize)
    expect(Number.parseFloat(wrapper.get("#task-1").element.style.height)).toBeCloseTo(height)
    settings.settings.appearance.taskView = "regular"
    await nextTick()
    expect(wrapper.get("#task-1").element.style.height).toBe("200px")
  })

  it("shows the normalized first line while opening the untouched rich content in the existing editor", async () => {
    const content = "# Ship **promo** codes\n\nBody details\n```js\nconst x = 1\n```\n![Diagram](file:diagram)"
    const task = makeTask({content})
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    const {useTaskEditorStore} = await import("../../../../src/renderer/src/stores/task-editor")
    useTasksStore().tasks = [task]
    const settings = await setup(task)
    expect(wrapper.get("#task-1").text()).toBe("Ship promo codes")
    await wrapper.get("#task-1").trigger("click")
    await flushPromises()
    expect(useTaskEditorStore().editingTaskId).toBe("task-1")
    expect(useTaskEditorStore().draft.content).toBe(content)
    useTaskEditorStore().patch({content: content + "\nUnsaved edit"})
    settings.settings.appearance.taskView = "regular"
    await nextTick()
    settings.settings.appearance.taskView = "compact"
    await nextTick()
    expect(useTaskEditorStore().draft.content).toBe(content + "\nUnsaved edit")
    expect(useTaskEditorStore().isDirty).toBe(true)
    expect(useTasksStore().tasks[0].content).toBe(content)
    expect(bridge["tasks:update"]).not.toHaveBeenCalled()
  })

  it.each(["", "\n\n", "![](file:image)\nLater body", "```\nLater code", "# ** **"])(
    "gives an empty normalized summary an explicit title for %s",
    async (content) => {
      await setup(makeTask({content}))
      expect(wrapper.get("#task-1").text()).toBe("Untitled task")
    },
  )

  it("keeps tags with overflow, time and priority together and puts relation, date and comments on another row", async () => {
    const {useTagsStore} = await import("../../../../src/renderer/src/stores/tags.store")
    const {useFilterStore} = await import("../../../../src/renderer/src/stores/filter.store")
    const {useTaskCommentsStore} = await import("../../../../src/renderer/src/stores/taskComments.store")
    const {useTaskRelationsStore} = await import("../../../../src/renderer/src/stores/taskRelations.store")
    const {useTasksStore} = await import("../../../../src/renderer/src/stores/tasks")
    const tags = ["alpha", "beta", "gamma", "delta"].map((name) => ({id: name, name, color: "#123456", branchId: "main"}))
    useTagsStore().tags = tags
    useFilterStore().setFrame("milestone")
    useTaskCommentsStore().commentCounts = {"task-1": 12}
    useTasksStore().tasks = [makeTask(), makeTask({id: "task-2"})]
    useTaskRelationsStore().relations = [{blockerId: "task-1", blockedId: "task-2"}]
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function () {
      return this.classList.contains("overflow-hidden") ? 100 : 40
    })
    await setup(makeTask({tags, spentTime: 2700, estimatedTime: 7200, priority: "high"}))
    const time = wrapper.get('use[href="#stopwatch"]').element.closest(".min-h-5")
    const comments = wrapper.get('use[href="#message"]').element.closest(".min-h-5")
    expect(time).not.toBe(comments)
    expect(time.textContent).toContain("+3")
    expect(time.textContent).toContain("45m")
    expect(time.textContent).toContain("2h")
    expect(time.querySelector('use[href="#priority-high"]')).not.toBeNull()
    expect(comments.textContent).toContain("12")
    expect(comments.querySelector('use[href="#calendar"]')).not.toBeNull()
    expect(comments.querySelector('use[href="#ban"]')).not.toBeNull()
    const menu = wrapper.findComponent({name: "BaseContextMenu"})
    expect(
      menu
        .props("items")
        .find((item) => item.value === "copy")
        .children.map((item) => item.value),
    ).toContain("copy-content")
    expect(menu.props("items").map((item) => item.value)).toContain("status")
  })
})
