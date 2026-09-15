import {describe, expect, it} from "vitest"

import {toImageAltText} from "../../../../src/renderer/src/ui/common/misc/MarkdownEditor/utils/toImageAltText"

describe("toImageAltText", () => {
  it("drops only the last extension", () => {
    expect(toImageAltText("image.png")).toBe("image")
    expect(toImageAltText("photo.jpeg")).toBe("photo")
    expect(toImageAltText("Screenshot 2026-08-16 at 10.30.45.png")).toBe("Screenshot 2026-08-16 at 10.30.45")
    expect(toImageAltText("archive.tar.gz")).toBe("archive.tar")
  })

  it("leaves a name without an extension alone, even with a dot in a directory", () => {
    expect(toImageAltText("photo")).toBe("photo")
    expect(toImageAltText("my.folder/photo")).toBe("my.folder/photo")
  })

  it("falls back to 'image' when nothing usable is left", () => {
    expect(toImageAltText("")).toBe("image")
    expect(toImageAltText(".png")).toBe("image")
    expect(toImageAltText("   ")).toBe("image")
  })
})
