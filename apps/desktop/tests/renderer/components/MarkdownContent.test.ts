// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {EditorView} from "@codemirror/view"
import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {installFakeResizeObserver, stubLayout} from "../../helpers/resizeObserver"

const {deliverResizeToObserved} = installFakeResizeObserver()

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
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeComment(overrides = {}) {
  return {
    id: "comment-1",
    taskId: "task-1",
    branchId: "main",
    content: "comment",
    kind: "manual",
    provider: null,
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

async function settle() {
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await nextTick()
}

describe("MarkdownContent", () => {
  let wrapper = null

  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it("renders_TC-4_a_not-yet-loaded_language_that_highlights_once_it_settles", async () => {
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")

    wrapper = mount(MarkdownContent, {props: {content: "```ruby\ndef greet\n  1\nend\n```"}, attachTo: document.body})
    await settle()

    const codeLines = () => Array.from(wrapper.element.querySelectorAll(".cm-codeblock-line:not(.cm-codeblock-first):not(.cm-codeblock-last)"))

    expect(wrapper.element.textContent).toContain("def greet")

    await vi.waitFor(
      () => {
        expect(codeLines().some((line) => line.querySelector("span[class]"))).toBe(true)
      },
      {timeout: 2000},
    )
  })

  it("mounts_TC-5_a_board_card_a_comment_a_deleted_task_and_a_search_result_with_no_editor_behind_any_of_them", async () => {
    const {default: TaskCard} = await import("../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/TaskCard.vue")
    const {default: CommentItem} = await import("../../../src/renderer/src/ui/modules/RightPanel/{fragments}/Comments/{fragments}/CommentItem.vue")
    const {default: DeletedTaskItem} =
      await import("../../../src/renderer/src/ui/views/Settings/{fragments}/DeletedTasks/{fragments}/DeletedTaskItem.vue")
    const {default: SearchResultItem} = await import("../../../src/renderer/src/ui/overlays/SearchModal/{fragments}/SearchResultItem.vue")

    const twoLines = "First line of the description\nSecond line of the description"
    const updatedLines = "Changed first line\nChanged second line"

    const globalStubs = {directives: {tooltip: {}}}

    const card = mount(TaskCard, {props: {task: makeTask({content: twoLines})}, global: globalStubs, attachTo: document.body})
    const comment = mount(CommentItem, {props: {comment: makeComment({content: twoLines})}, global: globalStubs, attachTo: document.body})
    const deleted = mount(DeletedTaskItem, {props: {task: makeTask({content: twoLines})}, global: globalStubs, attachTo: document.body})
    const searchResult = mount(SearchResultItem, {
      props: {result: makeSearchResult({task: makeTask({content: twoLines})})},
      global: globalStubs,
      attachTo: document.body,
    })

    await settle()

    for (const each of [card, comment, deleted, searchResult]) {
      expect(each.text()).toContain("First line of the description")
      expect(EditorView.findFromDOM(each.element)).toBeNull()
    }

    await card.setProps({task: makeTask({content: updatedLines})})
    await comment.setProps({comment: makeComment({content: updatedLines})})
    await deleted.setProps({task: makeTask({content: updatedLines})})
    await searchResult.setProps({
      result: makeSearchResult({
        task: makeTask({content: updatedLines}),
        matches: [{indices: [[0, 6]], value: "Changed", key: "plainText"}],
      }),
    })
    await settle()

    for (const each of [card, comment, deleted, searchResult]) {
      expect(each.text()).toContain("Changed first line")
      expect(EditorView.findFromDOM(each.element)).toBeNull()
    }

    card.unmount()
    comment.unmount()
    deleted.unmount()
    searchResult.unmount()
  })

  it("opens_TC-6_the_image_preview_with_the_clicked_images_url", async () => {
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")
    const {useBaseModal} = await import("../../../src/renderer/src/ui/base/BaseModal")

    wrapper = mount(MarkdownContent, {props: {content: "![a](daily://file/abc)"}, attachTo: document.body})
    await settle()

    const image = wrapper.element.querySelector(".cm-image-wrapper img")
    expect(image).not.toBeNull()

    image.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    await nextTick()

    const modal = useBaseModal("image-preview")
    expect(modal.isOpen.value).toBe(true)
    expect(modal.stack.value.find((item) => item.id === "image-preview")?.props.src).toBe("daily://file/abc")

    modal.remove("image-preview")
  })

  it("opens_TC-7_the_link_externally_without_navigating", async () => {
    const bridge = mockBridgeIPC({"shell:open-external": vi.fn().mockResolvedValue(true)})
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")

    wrapper = mount(MarkdownContent, {props: {content: "[docs](https://example.com)"}, attachTo: document.body})
    await settle()

    const link = wrapper.element.querySelector("a.cm-link-widget")
    expect(link).not.toBeNull()

    const event = new MouseEvent("click", {bubbles: true, cancelable: true})
    link.dispatchEvent(event)

    expect(bridge["shell:open-external"]).toHaveBeenCalledWith("https://example.com")
    expect(event.defaultPrevented).toBe(true)
  })

  it("clamps_TC-9_only_past_the_200px_threshold_while_minimizable", async () => {
    const {default: MarkdownContent} = await import("../../../src/renderer/src/ui/common/misc/MarkdownContent.vue")

    async function mountAt(height, minimizable = true) {
      const instance = mount(MarkdownContent, {props: {content: "text", minimizable}, attachTo: document.body})
      await nextTick()

      const contentEl = instance.element.querySelector(".cm-content")
      if (!contentEl) throw new Error("no .cm-content found")
      stubLayout(contentEl, {scrollHeight: height})

      deliverResizeToObserved()
      await settle()

      return instance
    }

    const tall = await mountAt(201)
    expect(tall.classes()).toContain("is-minimized")
    tall.unmount()

    const short = await mountAt(200)
    expect(short.classes()).not.toContain("is-minimized")
    short.unmount()

    const unclamped = await mountAt(300, false)
    expect(unclamped.classes()).not.toContain("is-minimized")
    unclamped.unmount()
  })
})
