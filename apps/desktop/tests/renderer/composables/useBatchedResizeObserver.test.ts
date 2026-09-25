// @vitest-environment happy-dom
// @ts-nocheck
import {defineComponent, h, nextTick} from "vue"
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import {useBatchedResizeObserver} from "../../../src/renderer/src/composables/useBatchedResizeObserver"
import {installFakeResizeObserver} from "../../helpers/resizeObserver"

const {deliverResize} = installFakeResizeObserver()

describe("useBatchedResizeObserver", () => {
  it("reads_TC-11_every_measure_before_writing_any_and_stops_touching_a_measure_once_its_owner_unmounts", async () => {
    const order = []
    const targetA = document.createElement("div")
    const targetB1 = document.createElement("div")
    const targetB2 = document.createElement("div")

    let readACalls = 0
    let writeACalls = 0

    function readA() {
      readACalls++
      order.push("read:A")
      return "a-value"
    }
    function writeA(value) {
      writeACalls++
      order.push(`write:A:${value}`)
    }
    function readB() {
      order.push("read:B")
      return "b-value"
    }
    function writeB(value) {
      order.push(`write:B:${value}`)
    }

    const hostA = mount(
      defineComponent({
        setup() {
          useBatchedResizeObserver([targetA], {read: readA, write: writeA})
          return () => h("div")
        },
      }),
    )
    const hostB = mount(
      defineComponent({
        setup() {
          useBatchedResizeObserver([targetB1, targetB2], {read: readB, write: writeB})
          return () => h("div")
        },
      }),
    )
    await nextTick()

    deliverResize(targetA, targetB1, targetB2)

    expect(order).toEqual(["read:A", "read:B", "write:A:a-value", "write:B:b-value"])

    hostA.unmount()
    await nextTick()

    order.length = 0
    deliverResize(targetA)

    expect(order).toEqual([])
    expect(readACalls).toBe(1)
    expect(writeACalls).toBe(1)

    hostB.unmount()
  })
})
