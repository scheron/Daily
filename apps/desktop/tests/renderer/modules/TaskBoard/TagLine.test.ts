// @ts-nocheck
import {nextTick} from "vue"
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"

import type {VueWrapper} from "@vue/test-utils"

const tags = ["alpha", "beta", "gamma", "delta"].map((name) => ({id: name, name, color: "#123456", branchId: "main"}))

describe("TagLine", () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  it("collapses_the_tags_that_do_not_fit_into_a_plus_n_listing_them_in_its_tooltip", async () => {
    const {default: TagLine} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/TagLine.vue")
    const tooltip = vi.fn()

    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-hidden") ? 120 : 40
    })

    wrapper = mount(TagLine, {props: {tags}, global: {directives: {tooltip: {mounted: (_el, binding) => tooltip(binding.value)}}}})
    await nextTick()

    const row = wrapper.element.lastElementChild as HTMLElement
    const shown = [...row.children].map((el) => el.textContent)
    expect(shown).toEqual(["#alpha", "#beta", "+2"])
    expect(tooltip).toHaveBeenCalledWith("#gamma, #delta")
  })

  async function mountWithWidth(tagList, containerWidth) {
    const {default: TagLine} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/TagLine.vue")

    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-hidden") ? containerWidth : 40
    })

    wrapper = mount(TagLine, {props: {tags: tagList}, global: {directives: {tooltip: {}}}})
    await nextTick()
    return [...(wrapper.element.lastElementChild as HTMLElement).children].map((el) => el.textContent)
  }

  it("keeps_every_tag_and_shows_no_plus_n_when_the_last_one_fits_exactly", async () => {
    expect(await mountWithWidth(tags.slice(0, 2), 88)).toEqual(["#alpha", "#beta"])
  })

  it("reserves_room_for_the_plus_n_so_a_tag_that_would_crowd_it_out_is_folded_in", async () => {
    expect(await mountWithWidth(tags.slice(0, 3), 100)).toEqual(["#alpha", "+2"])
  })
})
