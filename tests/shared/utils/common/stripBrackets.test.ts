// @ts-nocheck
import {describe, expect, it} from "vitest"

import {stripBrackets} from "@shared/utils/common/stripBrackets"

describe("stripBrackets", () => {
  it("strips a square-bracket pair (IPv6 host)", () => {
    expect(stripBrackets("[::1]")).toBe("::1")
  })

  it("strips other default bracket pairs", () => {
    expect(stripBrackets("(foo)")).toBe("foo")
    expect(stripBrackets("{bar}")).toBe("bar")
    expect(stripBrackets("<baz>")).toBe("baz")
  })

  it("leaves unwrapped or mismatched input unchanged", () => {
    expect(stripBrackets("example.com")).toBe("example.com")
    expect(stripBrackets("[oops)")).toBe("[oops)")
    expect(stripBrackets("")).toBe("")
  })

  it("only removes one outer pair", () => {
    expect(stripBrackets("[[x]]")).toBe("[x]")
  })

  it("honors a custom pair set", () => {
    expect(stripBrackets("«q»", [["«", "»"]])).toBe("q")
  })
})
