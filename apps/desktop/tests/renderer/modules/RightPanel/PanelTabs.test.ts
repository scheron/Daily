// @vitest-environment happy-dom
// @ts-nocheck
import {afterEach, describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import PanelTabs from "../../../../src/renderer/src/ui/modules/RightPanel/{fragments}/PanelTabs.vue"

describe("PanelTabs", () => {
  let wrapper = null

  afterEach(() => {
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

  it("counts_the_thread_on_the_comments_tab", () => {
    const tabs = setup({commentsCount: 12})

    expect(tabs.map((tab) => tab.text())).toEqual(["Editor", "Comments12", "History"])
  })

  it("leaves_the_counter_off_an_empty_thread_instead_of_showing_a_zero", () => {
    const tabs = setup({commentsCount: 0})

    expect(tabs[1].text()).toBe("Comments")
  })

  it("drops_the_tab_icons_when_the_panel_is_too_narrow_keeping_the_labels_and_the_counter", () => {
    const tabs = setup({commentsCount: 3, compact: true})

    expect(wrapper.findAll("svg")).toHaveLength(0)
    expect(tabs.map((tab) => tab.text())).toEqual(["Editor", "Comments3", "History"])
  })

  it("reports_the_tab_that_was_clicked", async () => {
    const tabs = setup()

    await tabs[1].trigger("click")
    await tabs[2].trigger("click")

    expect(wrapper.emitted("select")).toEqual([["comments"], ["history"]])
  })

  it("parks_the_indicator_under_the_active_tab_a_third_of_the_strip_at_a_time", async () => {
    setup({active: "editor"})
    expect(indicator().attributes("style")).toContain("translateX(0%)")

    await wrapper.setProps({active: "comments"})
    expect(indicator().attributes("style")).toContain("translateX(100%)")

    await wrapper.setProps({active: "history"})
    expect(indicator().attributes("style")).toContain("translateX(200%)")
  })

  it("puts_the_indicator_straight_under_the_open_tab_on_the_first_paint_and_slides_it_only_after", async () => {
    setup({active: "history"})

    expect(indicator().attributes("style")).toContain("translateX(200%)")
    expect(indicator().classes()).not.toContain("transition-transform")

    await nextFrame()

    expect(indicator().classes()).toContain("transition-transform")
  })
})
