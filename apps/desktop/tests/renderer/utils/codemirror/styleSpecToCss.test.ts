import {describe, expect, it} from "vitest"

import {styleSpecToCss} from "../../../../src/renderer/src/utils/codemirror/theme/styleSpecToCss"

describe("styleSpecToCss", () => {
  it("turns each selector's camelCase properties into kebab-case declarations", () => {
    expect(styleSpecToCss({".a, .b > c": {borderRadius: "1px", color: "red"}, ".d": {opacity: "0.5"}})).toBe(
      ".a, .b > c{border-radius:1px;color:red}.d{opacity:0.5}",
    )
  })
})
