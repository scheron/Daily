// @ts-nocheck
import {describe, expect, it} from "vitest"

describe("renderer workspace", () => {
  it("has access to DOM APIs via happy-dom", () => {
    const div = document.createElement("div")
    div.textContent = "hello"

    expect(div.textContent).toBe("hello")
  })
})
