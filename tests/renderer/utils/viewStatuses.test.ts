import {describe, expect, it} from "vitest"

import {otherStatuses, VIEW_ORDER} from "@renderer/ui/views/Main/{fragments}/Content/{fragments}/modes/rows/viewStatuses"

describe("viewStatuses", () => {
  it("orders views as active, done, discarded", () => {
    expect(VIEW_ORDER).toEqual(["active", "done", "discarded"])
  })

  it("returns the two other statuses in stable order", () => {
    expect(otherStatuses("active")).toEqual(["done", "discarded"])
    expect(otherStatuses("done")).toEqual(["active", "discarded"])
    expect(otherStatuses("discarded")).toEqual(["active", "done"])
  })
})
