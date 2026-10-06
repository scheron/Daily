// @ts-nocheck
import {describe, expect, it} from "vitest"

import {getActiveTagNames} from "../../../../src/renderer/src/utils/tags/getActiveTagNames"

function makeTask(tags) {
  return {id: "task", tags}
}

describe("getActiveTagNames", () => {
  it("resolves selected tag ids to names across tasks of different projects", () => {
    const tasks = [
      makeTask([
        {id: "a1", name: "work"},
        {id: "a2", name: "home"},
      ]),
      makeTask([{id: "b1", name: "work"}]),
    ]

    expect(getActiveTagNames(tasks, new Set(["b1"]))).toEqual(new Set(["work"]))
  })
})
