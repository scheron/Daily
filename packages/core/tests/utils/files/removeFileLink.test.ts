import {describe, expect, it} from "vitest"

import {removeFileLink} from "@core/utils/files/removeFileLink"

describe("removeFileLink", () => {
  it("removes only the matching file's link, leaving another file's link in place", () => {
    const content = "Before ![shot](daily://file/DF-a7Kf9Qm2xVb3Lp8Rt1Wz) middle ![other](daily://file/DF-keep1234567890) after"

    expect(removeFileLink(content, "DF-a7Kf9Qm2xVb3Lp8Rt1Wz")).toBe("Before  middle ![other](daily://file/DF-keep1234567890) after")
  })

  it("trims the whitespace the removed link leaves behind", () => {
    const content = "![shot](daily://file/DF-a7Kf9Qm2xVb3Lp8Rt1Wz)"

    expect(removeFileLink(content, "DF-a7Kf9Qm2xVb3Lp8Rt1Wz")).toBe("")
  })
})
