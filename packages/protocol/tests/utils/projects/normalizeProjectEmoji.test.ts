import {describe, expect, it} from "vitest"

import * as protocol from "../../../src/index"

describe("normalizeProjectEmoji", () => {
  it("accepts one complete emoji grapheme, including composed emoji", () => {
    expect(typeof protocol.normalizeProjectEmoji).toBe("function")
    for (const emoji of ["🚀", "👩🏽‍🚀", "👨‍👩‍👧‍👦", "🇯🇵", "1️⃣", "#️⃣", "👍🏿", "❤️", "❤", "🏳️‍🌈"]) {
      expect(protocol.normalizeProjectEmoji(`  ${emoji}  `)).toBe(emoji)
    }
  })

  it("clears empty values and rejects text, multiple emoji and isolated emoji parts", () => {
    expect(typeof protocol.normalizeProjectEmoji).toBe("function")
    for (const value of [undefined, null, "", "  ", "project", "a", "1", "#", "🚀🎯", "🚀 launch", "🇯", "🏽", "\u200d", "a️", "🚀\u200da"]) {
      expect(protocol.normalizeProjectEmoji(value)).toBeNull()
    }
  })
})
