// @vitest-environment happy-dom
// @ts-nocheck
import {nextTick} from "vue"
import {createPinia, setActivePinia} from "pinia"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {mount} from "@vue/test-utils"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"
import {makeSessionTask} from "../../helpers/focusFixtures"

describe("the focus window", () => {
  let bridge = null
  let wrapper = null

  beforeEach(() => {
    bridge = mockBridgeIPC()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ""
  })

  function buttonNamed(label) {
    return wrapper.findAll("button").find((button) => button.text() === label)
  }

  async function mountWindow() {
    const {default: Focus} = await import("../../../src/renderer/src/ui/views/Focus.vue")
    const {useFocusStore} = await import("../../../src/renderer/src/stores/focus.store")

    const focus = useFocusStore()
    await vi.waitFor(() => expect(focus.session).not.toBeNull())
    focus.session = {...focus.session, isDetached: true}

    wrapper = mount(Focus, {attachTo: document.body, global: {directives: {tooltip: {}}}})
    await nextTick()
    return {focus}
  }

  it("tells main it is ready once mounted, so main can show the window", async () => {
    await mountWindow()

    expect(bridge.send).toHaveBeenCalledWith("window:ready")
  })

  it("offers no way to add in an empty collect: no box, only the mode and a disabled Start", async () => {
    await mountWindow()

    expect(wrapper.text()).not.toContain("Drag tasks here")
    expect(wrapper.text()).toContain("Mode")
    expect(buttonNamed("Start").attributes("disabled")).toBeDefined()
  })

  it("runs the session in the window: × removes a row, and focus shows the clock and Done", async () => {
    const {focus} = await mountWindow()
    focus.session = {...focus.session, tasks: [makeSessionTask("S1"), makeSessionTask("S2")]}
    await nextTick()

    await wrapper.findAll("[data-focus-row]")[1].find("button").trigger("click")
    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "remove", taskId: "S2"})

    focus.session = {...focus.session, phase: "focus", currentTaskId: "S1", runStartedAt: new Date().toISOString()}
    await nextTick()

    expect(wrapper.find("circle[stroke-dashoffset]").exists()).toBe(true)
    expect(buttonNamed("Done")).toBeDefined()
  })

  it("attaches the session from the title bar's button", async () => {
    await mountWindow()

    await wrapper.find("header button").trigger("click")

    expect(bridge["focus:dispatch"]).toHaveBeenCalledWith({type: "attach"})
  })
})
