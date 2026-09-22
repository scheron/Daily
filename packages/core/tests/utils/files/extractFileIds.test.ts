import {describe, expect, it} from "vitest"

import {extractFileIds} from "@core/utils/files/extractFileIds"

describe("extractFileIds", () => {
  it("reads a marked id whole, hyphen and all, rather than stopping at the mark", () => {
    const content = "![shot](daily://file/DF-a7Kf9Qm2xVb3Lp8Rt1Wz)"

    expect(extractFileIds(content)).toEqual(["DF-a7Kf9Qm2xVb3Lp8Rt1Wz"])
  })

  it("still reads an unmarked id minted before the marks existed, underscores included", () => {
    const content = "![old](daily://file/V1StGXR8_Z5jdHi6B-myT)"

    expect(extractFileIds(content)).toEqual(["V1StGXR8_Z5jdHi6B-myT"])
  })

  it("collects both formats from one task body without confusing them", () => {
    const content = "![old](daily://file/V1StGXR8_Z5jdHi6B-myT) and ![new](daily://file/DF-a7Kf9Qm2xVb3Lp8Rt1Wz)"

    expect(extractFileIds(content)).toEqual(["V1StGXR8_Z5jdHi6B-myT", "DF-a7Kf9Qm2xVb3Lp8Rt1Wz"])
  })
})
