// @vitest-environment happy-dom
// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {getToday} from "@daily/std"

import {closeCompletion, completionStatus, currentCompletions} from "@codemirror/autocomplete"
import {undo} from "@codemirror/commands"
import {EditorView} from "@codemirror/view"
import {flushPromises, mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {pressKey, typeText} from "../../helpers/editorView"

const SRC = "../../../src/renderer/src"

describe("the Quick task window view", () => {
  let bridge = null
  let wrapper = null
  let shown = null
  let pickMenuRow = null

  beforeEach(async () => {
    bridge = mockBridgeIPC({
      "platform:is-mac": vi.fn().mockReturnValue(true),
      "tasks:create": vi.fn().mockResolvedValue({}),
      "quick-task:hide": vi.fn(),
      "quick-task:resize": vi.fn(),
      "quick-task:set-menu": vi.fn(),
      "quick-task:on-menu-pick": vi.fn((callback) => {
        pickMenuRow = callback
        return vi.fn()
      }),
      "quick-task:on-shown": vi.fn((callback) => {
        shown = callback
        return vi.fn()
      }),
    })
    setActivePinia(createPinia())
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const {useSettingsStore} = await import(`${SRC}/stores/settings.store`)
    const {useBranchesStore} = await import(`${SRC}/stores/branches.store`)
    await useSettingsStore().revalidate()
    useBranchesStore().branches = [
      {id: "main", name: "Main", createdAt: "", updatedAt: "", deletedAt: null},
      {id: "daily", name: "Daily", createdAt: "", updatedAt: "", deletedAt: null},
    ]
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    shown = null
    pickMenuRow = null
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function mountView() {
    const {default: QuickTask} = await import(`${SRC}/ui/views/QuickTask/QuickTask.vue`)
    wrapper = mount(QuickTask, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    await flushPromises()
    return wrapper.findComponent({name: "MarkdownEditor"})
  }

  function chips() {
    return wrapper.findAll("[data-chip]").map((chip) => chip.attributes("data-chip"))
  }

  function pressCmdEnter() {
    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", metaKey: true, cancelable: true}))
  }

  it("signals the window ready once mounted", async () => {
    await mountView()

    expect(bridge.send).toHaveBeenCalledWith("window:ready")
  })

  it("opens with the editor five lines tall, an empty draft included", async () => {
    await mountView()

    expect(wrapper.find(".markdown-editor").attributes("style")).toContain("--editor-min-lines: 5")
  })

  it("keeps the chips and the hint in one bottom row under the editor", async () => {
    await mountView()

    const footer = wrapper.find("[data-testid=quick-task-footer]")
    expect(footer.findAll("[data-chip]")).toHaveLength(2)
    const hint = footer.find("[data-testid=quick-task-hint]")
    expect(hint.findAll("kbd").map((cap) => cap.text())).toEqual(["⌘", "↵", "Esc"])
    expect([...hint.element.children].map((child) => child.textContent.replace(/\s+/g, ""))).toEqual(["⌘↵", "send", "Esc", "close"])
    expect(wrapper.find(".markdown-editor").element.compareDocumentPosition(footer.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("asks the main process to hide the panel on Escape", async () => {
    await mountView()

    window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))

    expect(bridge["quick-task:hide"]).toHaveBeenCalledTimes(1)
  })

  it("starts as the active project in Backlog with no other chip", async () => {
    await mountView()

    expect(chips()).toEqual(["project", "status"])
    expect(wrapper.find("[data-chip=project]").text()).toBe("Main")
    expect(wrapper.find("[data-chip=status]").text()).toBe("Backlog")
  })

  it("a picked date moves Backlog to Active and its remove button returns to Backlog", async () => {
    const editor = await mountView()

    editor.vm.$emit("patch", {scheduled: {date: "2030-01-02", time: "10:00:00", timezone: "UTC"}})
    await flushPromises()

    expect(chips()).toEqual(["project", "status", "date"])
    expect(wrapper.find("[data-chip=status]").text()).toBe("Active")

    await wrapper.find("[data-chip=date] button").trigger("click")

    expect(chips()).toEqual(["project", "status"])
    expect(wrapper.find("[data-chip=status]").text()).toBe("Backlog")
  })

  it("Done without a date is scheduled on today", async () => {
    const editor = await mountView()

    editor.vm.$emit("patch", {status: "done"})
    await flushPromises()

    expect(wrapper.find("[data-chip=date]").text()).toBe("Today")
  })

  it("Backlog clears a picked date", async () => {
    const editor = await mountView()
    editor.vm.$emit("patch", {scheduled: {date: "2030-01-02", time: "10:00:00", timezone: "UTC"}})
    await flushPromises()

    editor.vm.$emit("patch", {status: "backlog"})
    await flushPromises()

    expect(chips()).toEqual(["project", "status"])
  })

  it("Cmd+Enter creates the task on today with the picked fields, hides the panel and clears the draft", async () => {
    const editor = await mountView()
    editor.vm.$emit("update:content", "Call the dentist")
    editor.vm.$emit("patch", {status: "active", estimatedTime: 3600, branchId: "daily"})
    await flushPromises()

    pressCmdEnter()
    await flushPromises()

    expect(bridge["tasks:create"]).toHaveBeenCalledTimes(1)
    expect(bridge["tasks:create"]).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Call the dentist",
        status: "active",
        estimatedTime: 3600,
        branchId: "daily",
        scheduled: expect.objectContaining({date: getToday()}),
      }),
    )
    expect(bridge["quick-task:hide"]).toHaveBeenCalledTimes(1)
    expect(chips()).toEqual(["project", "status"])
    expect(wrapper.find("[data-chip=project]").text()).toBe("Main")
  })

  it("a picked milestone shows as a chip and is saved with the task; a project change drops it together with the tags", async () => {
    const {useMilestonesStore} = await import(`${SRC}/stores/milestones.store`)
    useMilestonesStore().milestones = [{id: "m1", name: "Launch", branchId: "main", orderIndex: 0, createdAt: "", updatedAt: "", deletedAt: null}]
    const editor = await mountView()
    editor.vm.$emit("update:content", "Ship it")
    editor.vm.$emit("patch", {milestoneId: "m1", tags: [{id: "t1", name: "work", color: "#000", branchId: "main"}]})
    await flushPromises()

    expect(chips()).toEqual(["project", "milestone", "status", "tag"])
    expect(wrapper.find("[data-chip=milestone]").text()).toBe("Launch")

    editor.vm.$emit("patch", {branchId: "daily"})
    await flushPromises()
    expect(chips()).toEqual(["project", "status"])

    editor.vm.$emit("patch", {branchId: "main", milestoneId: "m1"})
    await flushPromises()
    pressCmdEnter()
    await flushPromises()

    expect(bridge["tasks:create"]).toHaveBeenCalledWith(expect.objectContaining({content: "Ship it", branchId: "main", milestoneId: "m1", tags: []}))
  })

  it("Cmd+Enter with empty content saves nothing", async () => {
    await mountView()

    pressCmdEnter()
    await flushPromises()

    expect(bridge["tasks:create"]).not.toHaveBeenCalled()
    expect(bridge["quick-task:hide"]).not.toHaveBeenCalled()
  })

  it("showing the panel again keeps the draft", async () => {
    const editor = await mountView()
    editor.vm.$emit("update:content", "Half-written")
    editor.vm.$emit("patch", {branchId: "daily"})
    await flushPromises()

    shown()
    await flushPromises()

    expect(wrapper.find("[data-chip=project]").text()).toBe("Daily")
    expect(editor.props("content")).toBe("Half-written")
  })

  it("showing an untouched panel re-takes the project active now", async () => {
    await mountView()
    const {useSettingsStore} = await import(`${SRC}/stores/settings.store`)
    bridge["settings:load"].mockResolvedValue({...(await bridge["settings:load"]()), branch: {activeId: "daily"}})

    shown()
    await vi.waitFor(() => expect(wrapper.find("[data-chip=project]").text()).toBe("Daily"))
    expect(useSettingsStore().settings.branch.activeId).toBe("daily")
  })

  it("turns image paste and drop off, since the panel keeps no attachments", async () => {
    const editor = await mountView()

    expect(editor.props("noAttachments")).toBe(true)
  })

  it("Escape closes an open slash menu first and hides the panel only when nothing consumed it", async () => {
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)
    typeText(view, "/")
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))

    pressKey(view, {key: "Escape"})

    expect(completionStatus(view.state)).toBeNull()
    expect(bridge["quick-task:hide"]).not.toHaveBeenCalled()

    pressKey(view, {key: "Escape"})

    expect(bridge["quick-task:hide"]).toHaveBeenCalledTimes(1)
  })

  it("keeps the slash menu out of the panel and hands it to the menu window", async () => {
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)

    typeText(view, "/")
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))

    await vi.waitFor(() => expect(bridge["quick-task:set-menu"]).toHaveBeenLastCalledWith(expect.objectContaining({selected: 0})))
    const menu = bridge["quick-task:set-menu"].mock.calls.at(-1)[0]
    expect(menu.rows[0].label).toBe("Divider")
    expect(menu.rows.map((row) => row.label)).toContain("Status")

    closeCompletion(view)
    await vi.waitFor(() => expect(bridge["quick-task:set-menu"]).toHaveBeenLastCalledWith(null))
  })

  it("a click on a menu row selects and accepts it, and the editor keeps the keyboard", async () => {
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)
    typeText(view, "/")
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
    await new Promise((resolve) => setTimeout(resolve, 100))
    const index = currentCompletions(view.state).findIndex((completion) => completion.label === "/Heading 2")

    pickMenuRow(index)
    await flushPromises()

    expect(view.state.doc.toString()).toBe("## ")
    expect(completionStatus(view.state)).toBeNull()
    expect(view.hasFocus).toBe(true)
  })

  it("a click on a row that is gone from a shrunk list accepts nothing", async () => {
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)
    typeText(view, "/")
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
    await new Promise((resolve) => setTimeout(resolve, 100))
    const count = currentCompletions(view.state).length

    pickMenuRow(count)
    await flushPromises()

    expect(view.state.doc.toString()).toBe("/")
    expect(completionStatus(view.state)).toBe("active")
  })

  it("a click that arrives after the menu closed accepts nothing and does not steal focus", async () => {
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)
    typeText(view, "/")
    await vi.waitFor(() => expect(completionStatus(view.state)).toBe("active"))
    await new Promise((resolve) => setTimeout(resolve, 100))
    closeCompletion(view)
    view.contentDOM.blur()

    pickMenuRow(0)
    await flushPromises()

    expect(view.state.doc.toString()).toBe("/")
    expect(view.hasFocus).toBe(false)
  })

  it("a save starts a fresh undo history", async () => {
    vi.useFakeTimers({toFake: ["Date"], now: new Date("2030-03-10T12:00:00")})
    await mountView()
    const view = EditorView.findFromDOM(wrapper.find(".cm-editor").element.parentElement)
    typeText(view, "Call the dentist")
    await flushPromises()
    vi.setSystemTime(new Date("2030-03-10T12:00:05"))

    pressCmdEnter()
    await flushPromises()
    undo(view)
    await flushPromises()

    expect(view.state.doc.toString()).toBe("")
  })

  it("a status picked yesterday keeps meaning today when the panel is shown and saved again", async () => {
    vi.useFakeTimers({toFake: ["Date"], now: new Date("2030-03-10T12:00:00")})
    const editor = await mountView()
    editor.vm.$emit("update:content", "Report")
    editor.vm.$emit("patch", {status: "done"})
    await flushPromises()
    expect(wrapper.find("[data-chip=date]").text()).toBe("Today")

    vi.setSystemTime(new Date("2030-03-11T09:00:00"))
    shown()
    await flushPromises()
    pressCmdEnter()
    await flushPromises()

    expect(bridge["tasks:create"]).toHaveBeenCalledWith(expect.objectContaining({scheduled: expect.objectContaining({date: "2030-03-11"})}))
  })

  it("an explicitly picked date is not moved when the panel is shown again", async () => {
    vi.useFakeTimers({toFake: ["Date"], now: new Date("2030-03-10T12:00:00")})
    const editor = await mountView()
    editor.vm.$emit("patch", {scheduled: {date: "2030-03-15", time: "10:00:00", timezone: "UTC"}})
    await flushPromises()

    vi.setSystemTime(new Date("2030-03-11T09:00:00"))
    shown()
    await flushPromises()

    const {useTasksStore} = await import(`${SRC}/stores/tasks`)
    expect(wrapper.find("[data-chip=date]").exists()).toBe(true)
    expect(useTasksStore().activeDay).toBe("2030-03-11")

    editor.vm.$emit("update:content", "Report")
    await flushPromises()
    pressCmdEnter()
    await flushPromises()

    expect(bridge["tasks:create"]).toHaveBeenCalledWith(expect.objectContaining({scheduled: expect.objectContaining({date: "2030-03-15"})}))
  })

  it("showing the panel refreshes the active day", async () => {
    await mountView()
    const {useTasksStore} = await import(`${SRC}/stores/tasks`)
    useTasksStore().setActiveDay("2000-01-01")

    shown()
    await flushPromises()

    expect(useTasksStore().activeDay).toBe(getToday())
  })

  it("a draft whose project was deleted falls back to the active project", async () => {
    const editor = await mountView()
    editor.vm.$emit("update:content", "Half-written")
    editor.vm.$emit("patch", {branchId: "daily"})
    await flushPromises()
    const {useBranchesStore} = await import(`${SRC}/stores/branches.store`)
    useBranchesStore().branches = useBranchesStore().branches.filter((branch) => branch.id !== "daily")

    shown()
    await flushPromises()

    expect(wrapper.find("[data-chip=project]").text()).toBe("Main")
    expect(editor.props("content")).toBe("Half-written")
  })
})
