import {describe, expect, it} from "vitest"

import {toImageAltText} from "../../../../src/renderer/src/utils/images/toImageAltText"

describe("toImageAltText", () => {
  it("drops the extension", () => {
    expect(toImageAltText("image.png")).toBe("image")
    expect(toImageAltText("photo.jpeg")).toBe("photo")
  })

  it("drops only the last extension, keeping dots inside the name", () => {
    expect(toImageAltText("Screenshot 2026-08-16 at 10.30.45.png")).toBe("Screenshot 2026-08-16 at 10.30.45")
    expect(toImageAltText("archive.tar.gz")).toBe("archive.tar")
  })

  it("leaves a name that has no extension alone", () => {
    expect(toImageAltText("photo")).toBe("photo")
  })

  it("falls back to 'image' when nothing usable is left", () => {
    expect(toImageAltText("")).toBe("image")
    expect(toImageAltText(".png")).toBe("image")
    expect(toImageAltText("   ")).toBe("image")
  })

  it("does not mistake a dot in a directory segment for an extension", () => {
    expect(toImageAltText("my.folder/photo")).toBe("my.folder/photo")
  })
})
