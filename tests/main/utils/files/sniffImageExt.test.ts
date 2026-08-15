// @ts-nocheck
import {describe, expect, it} from "vitest"

import {sniffImageExt} from "@main/utils/files/sniffImageExt"

describe("sniffImageExt", () => {
  it("returns_TC-1_png_for_the_png_signature", () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    expect(sniffImageExt(data)).toBe("png")
  })

  it("returns_TC-2_jpg_not_jpeg_for_the_jpeg_signature", () => {
    const data = Buffer.from([0xff, 0xd8, 0xff])

    expect(sniffImageExt(data)).toBe("jpg")
  })

  it("returns_TC-3_gif_for_the_gif8_signature", () => {
    const data = Buffer.from([0x47, 0x49, 0x46, 0x38])

    expect(sniffImageExt(data)).toBe("gif")
  })

  it("returns_TC-4_webp_for_riff_at_0_and_webp_at_8", () => {
    const data = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // "RIFF" at offset 0
      0x00,
      0x00,
      0x00,
      0x00, // chunk size, arbitrary
      0x57,
      0x45,
      0x42,
      0x50, // "WEBP" at offset 8
    ])

    expect(sniffImageExt(data)).toBe("webp")
  })

  it.each([
    ["riff_container_but_wave_not_webp", Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])],
    ["svg_text", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf-8")],
    ["shorter_than_any_signature", Buffer.from([0x52, 0x49, 0x46])],
    ["empty_buffer", Buffer.alloc(0)],
  ])("returns_TC-5_null_without_throwing_for_a_non_image_buffer_(%s)", (_label, data) => {
    expect(() => sniffImageExt(data)).not.toThrow()
    expect(sniffImageExt(data)).toBeNull()
  })
})
