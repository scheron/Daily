// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import PanelTabs from "../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/PanelTabs.vue"

describe("PanelTabs", () => {
  let wrapper = null

  afterEach(() => {
    vi.restoreAllMocks()
    wrapper?.unmount()
    wrapper = null
  })

  function indicator() {
    return wrapper.find('[aria-hidden="true"] > div')
  }

  async function nextFrame() {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await wrapper.vm.$nextTick()
  }

  function setup(props = {}) {
    wrapper = mount(PanelTabs, {
      props: {active: "editor", commentsCount: 0, ...props},
      global: {directives: {tooltip: {}}},
    })
    return wrapper.findAll("button")
  }

  it("shows_the_label_and_an_icon_on_every_tab", () => {
    const tabs = setup({active: "history", commentsCount: 12, subtasksCount: {done: 1, total: 3}})

    expect(tabs.map((tab) => tab.text())).toEqual(["Editor", "Comments12", "History", "Subtasks1/3"])
    expect(wrapper.findAll("svg")).toHaveLength(4)
  })

  it("names_every_tab_by_its_label_and_its_count_spoken_in_words", () => {
    const tabs = setup({active: "editor", commentsCount: 2, subtasksCount: {done: 1, total: 3}})

    expect(tabs.map((tab) => tab.attributes("aria-label"))).toEqual(["Editor", "Comments, 2", "History", "Subtasks, 1 of 3"])
  })

  it("keeps_the_count_in_the_name_of_the_active_tab_and_starts_it_with_the_visible_label", () => {
    const tabs = setup({active: "subtasks", subtasksCount: {done: 1, total: 3}})

    expect(tabs[3].text()).toBe("Subtasks1/3")
    expect(tabs[3].attributes("aria-label")).toBe("Subtasks, 1 of 3")
  })

  it("names_a_tab_without_a_count_by_its_label_alone", () => {
    const tabs = setup({active: "editor", commentsCount: 0})

    expect(tabs.map((tab) => tab.attributes("aria-label"))).toEqual(["Editor", "Comments", "History", "Subtasks"])
  })

  it("leaves_the_counter_off_an_empty_thread_and_a_task_without_subtasks", () => {
    const tabs = setup({active: "comments", commentsCount: 0, subtasksCount: null})

    expect(tabs.map((tab) => tab.text())).toEqual(["Editor", "Comments", "History", "Subtasks"])
  })

  it("reports_the_tab_that_was_clicked", async () => {
    const tabs = setup()

    await tabs[1].trigger("click")
    await tabs[2].trigger("click")
    await tabs[3].trigger("click")

    expect(wrapper.emitted("select")).toEqual([["comments"], ["history"], ["subtasks"]])
  })

  it("follows_the_active_tab_by_its_measured_position_and_width", async () => {
    const widths = {Editor: 90, Comments: 120, History: 80, Subtasks: 100}
    const spy = (name, get) => vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(get)
    spy("offsetWidth", function () {
      return widths[this.textContent.trim()] ?? 40
    })
    spy("offsetLeft", function () {
      return this.textContent.trim() === "Comments" ? 90 : 0
    })

    setup({active: "editor"})
    await wrapper.vm.$nextTick()
    expect(indicator().attributes("style")).toContain("width: 90px")

    await wrapper.setProps({active: "comments"})
    await nextFrame()
    expect(indicator().attributes("style")).toContain("translateX(90px)")
    expect(indicator().attributes("style")).toContain("width: 120px")
  })

  it("slides_the_indicator_only_after_the_first_paint", async () => {
    setup({active: "history"})

    expect(indicator().classes()).not.toContain("transition-all")

    await nextFrame()

    expect(indicator().classes()).toContain("transition-all")
  })
})
