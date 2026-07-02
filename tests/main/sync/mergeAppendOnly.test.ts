// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mergeAppendOnly} from "@main/utils/sync/merge/mergeAppendOnly"

describe("mergeAppendOnly", () => {
  it("unions both sides, deduping by id", () => {
    const local = [{id: "a"}, {id: "b"}]
    const remote = [{id: "b"}, {id: "c"}]

    const {result} = mergeAppendOnly(local, remote)

    expect(result.map((e) => e.id).sort()).toEqual(["a", "b", "c"])
  })

  it("reports only remote-only ids as added", () => {
    const local = [{id: "a"}]
    const remote = [{id: "a"}, {id: "c"}]

    const {added} = mergeAppendOnly(local, remote)

    expect(added.map((e) => e.id)).toEqual(["c"])
  })

  it("keeps the local copy on id collision — events are immutable", () => {
    const local = [{id: "a", v: "local"}]
    const remote = [{id: "a", v: "remote"}]

    const {result, added} = mergeAppendOnly(local, remote)

    expect(result).toEqual([{id: "a", v: "local"}])
    expect(added).toEqual([])
  })
})
