import {describe, expect, it} from "vitest"

import {keyBetween} from "@core/utils/subtasks/keyBetween"

describe("keyBetween", () => {
  it("sorts_every_key_it_returns_strictly_between_its_neighbours_however_often_the_same_gap_is_split", () => {
    const keys = [keyBetween(null, null)]

    for (let i = 0; i < 40; i++) keys.push(keyBetween(keys.at(-1) ?? null, null))
    for (let i = 0; i < 40; i++) keys.splice(1, 0, keyBetween(keys[0], keys[1]))
    for (let i = 0; i < 40; i++) keys.unshift(keyBetween(null, keys[0]))

    expect(keys).toEqual([...keys].sort())
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((key) => !key.endsWith("0"))).toBe(true)
  })

  it("falls_back_to_after_the_first_key_when_the_second_does_not_sort_after_it", () => {
    expect(keyBetween("m", "m") > "m").toBe(true)
    expect(keyBetween("m", "a") > "m").toBe(true)
  })
})
