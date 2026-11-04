// @vitest-environment happy-dom
import {nextTick} from "vue"
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {makeTask} from "../../helpers/taskFixtures"

import type {SearchMatch, TaskSearchResult} from "@daily/protocol"

function makeSearchResult(overrides: Partial<TaskSearchResult> = {}): TaskSearchResult {
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

    const headMutations: MutationRecord[] = []
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
  it("updates source matches on the same task while retaining the Markdown formatting", async () => {
    const {default: SearchResultItem} = await import("../../../src/renderer/src/ui/overlays/SearchModal/{fragments}/SearchResultItem.vue")
    const content = "Before **first** then `second`"
    const task = makeTask({content})
    const match = (text: string): SearchMatch => {
      const start = content.indexOf(text)
      return {indices: [[start, start + text.length - 1]], value: text, key: "content"}
    }
    const wrapper = mount(SearchResultItem, {
      attachTo: document.body,
      props: {result: makeSearchResult({task, matches: [match("first")]})},
    })

    await nextTick()
    expect(wrapper.find("strong .markdown-search-highlight").text()).toBe("first")

    await wrapper.setProps({result: makeSearchResult({task, matches: [match("second")]})})
    expect(wrapper.find("strong .markdown-search-highlight").exists()).toBe(false)
    expect(wrapper.find("code .markdown-search-highlight").text()).toBe("second")
    expect(wrapper.find("[contenteditable=true]").exists()).toBe(false)

    wrapper.unmount()
  })
})
