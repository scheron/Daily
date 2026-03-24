// @ts-nocheck
import {describe, expect, it} from "vitest"

import {stripUnknown} from "@shared/utils/objects/stripUnknown"

describe("stripUnknown", () => {
  it("strips properties that are not present in the shape", () => {
    const shape = {name: "", age: 0}
    const incoming = {name: "Alice", age: 30, extra: "should be removed"}
    expect(stripUnknown(shape, incoming)).toEqual({name: "Alice", age: 30})
  })

  it("recursively filters nested objects against a nested shape", () => {
    const shape = {user: {name: "", role: ""}}
    const incoming = {user: {name: "Bob", role: "admin", secret: "x"}}
    expect(stripUnknown(shape, incoming)).toEqual({user: {name: "Bob", role: "admin"}})
  })

  it("drops null and undefined values when skipNullish is true", () => {
    const shape = {a: "", b: "", c: ""}
    const incoming = {a: "keep", b: null, c: undefined}
    expect(stripUnknown(shape, incoming, {skipNullish: true})).toEqual({a: "keep"})
  })
})
