// @ts-nocheck
import {nextTick} from "vue"
import {afterEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"

import type {VueWrapper} from "@vue/test-utils"

function makeTag(overrides = {}) {
  return {id: "tag-1", name: "tag", color: "#123456", branchId: "main", ...overrides}
}

const tags = ["alpha", "beta", "gamma", "delta"].map((name, index) =>
  makeTag({id: name, name, color: ["#123456", "#654321", "#0000ff", "#00ff00"][index]}),
)

describe("TagLine", () => {
  let wrapper: VueWrapper | undefined

  afterEach(() => {
    wrapper?.unmount()
    vi.restoreAllMocks()
  })

  it("opens hidden tags in a coloured, noninteractive popover on hover without opening the card", async () => {
    const {default: TagLine} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/TagLine.vue")
    const openCard = vi.fn()

    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-hidden") ? 120 : 40
    })

    wrapper = mount(TagLine, {props: {tags, onClick: openCard}, attachTo: document.body, global: {directives: {tooltip: {}}}})
    await nextTick()

    const row = wrapper.element.lastElementChild as HTMLElement
    const shown = [...row.children].map((el) => el.textContent.trim())
    expect(shown).toEqual(["#alpha", "#beta", "+2"])
    expect(document.querySelector("[data-popup]")).toBeNull()

    const more = wrapper.findAll("span, button").find((element) => element.text() === "+2")
    await more.trigger("mouseenter")
    await nextTick()

    const popup = document.querySelector("[data-popup]")
    expect(popup).not.toBeNull()
    const hidden = [...popup.querySelectorAll("button")]
    expect(hidden.map((tag) => tag.textContent.replace(/\s/g, ""))).toEqual(["#gamma", "#delta"])
    expect(hidden.map((tag) => tag.disabled)).toEqual([true, true])
    expect(hidden.map((tag) => tag.style.getPropertyValue("--tag-color"))).toEqual(["#0000ff", "#00ff00"])
    expect(popup.querySelector(".selectable, .active, a, [tabindex='0']")).toBeNull()

    await more.trigger("click")
    expect(openCard).not.toHaveBeenCalled()

    await wrapper.setProps({tags: tags.slice(0, 2)})
    await nextTick()
    expect(document.querySelector("[data-popup]")).toBeNull()
  })

  async function mountWithWidth(tagList, containerWidth, tagWidths = {}) {
    const {default: TagLine} = await import("../../../../src/renderer/src/ui/modules/TaskBoard/{fragments}/TaskCard/{fragments}/TagLine.vue")

    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("overflow-hidden") ? containerWidth : (tagWidths[this.textContent.trim()] ?? 40)
    })

    wrapper = mount(TagLine, {props: {tags: tagList}, global: {directives: {tooltip: {}}}})
    await nextTick()
    return [...(wrapper.element.lastElementChild as HTMLElement).children].map((el) => el.textContent.trim())
  }

  it("keeps_every_tag_and_shows_no_plus_n_when_the_last_one_fits_exactly", async () => {
    expect(await mountWithWidth(tags.slice(0, 2), 88)).toEqual(["#alpha", "#beta"])
  })

  it("reserves_room_for_the_plus_n_so_a_tag_that_would_crowd_it_out_is_folded_in", async () => {
    expect(await mountWithWidth(tags.slice(0, 3), 100)).toEqual(["#alpha", "+2"])
  })

  it("skips an oversized first tag and keeps later tags visible in their original order", async () => {
    expect(await mountWithWidth(tags, 120, {"#alpha": 300})).toEqual(["#beta", "#gamma", "+2"])
    await wrapper.get("button").trigger("mouseenter")
    const popup = document.querySelector("[data-popup]")
    expect([...popup.querySelectorAll("button")].map((tag) => tag.textContent.replace(/\s/g, ""))).toEqual(["#alpha", "#delta"])
  })

  it("keeps the popover open on blur into its noninteractive content and closes when focus moves to another control", async () => {
    await mountWithWidth(tags, 120)
    const more = wrapper.get("button")
    await more.trigger("focus")
    await more.trigger("blur", {relatedTarget: null})
    expect(document.querySelector("[data-popup]")).not.toBeNull()

    await more.trigger("blur", {relatedTarget: document.createElement("button")})
    expect(document.querySelector("[data-popup]")).toBeNull()
  })
})
