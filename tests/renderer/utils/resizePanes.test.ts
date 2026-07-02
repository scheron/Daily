// @ts-nocheck
import {describe, expect, it} from "vitest"

import {resizePanes} from "@renderer/utils/ui/resizePanes"

const wide = {min: 40, max: 1000}

describe("resizePanes", () => {
  it("moves delta between two neighbours, preserving their sum", () => {
    expect(resizePanes([100, 100, 100], 0, 30, wide, wide)).toEqual([130, 70, 100])
  })

  it("clamps the dragged pane at its min", () => {
    expect(resizePanes([100, 100, 100], 0, -90, wide, wide)).toEqual([40, 160, 100])
  })

  it("clamps the neighbour at its min", () => {
    expect(resizePanes([100, 100, 100], 0, 90, wide, wide)).toEqual([160, 40, 100])
  })

  it("respects a taller neighbour min", () => {
    expect(resizePanes([100, 100, 100], 0, 90, wide, {min: 70, max: 1000})).toEqual([130, 70, 100])
  })

  it("respects a taller dragged-pane min", () => {
    expect(resizePanes([100, 100, 100], 0, -90, {min: 70, max: 1000}, wide)).toEqual([70, 130, 100])
  })

  it("caps the dragged pane at its max", () => {
    expect(resizePanes([100, 100, 100], 0, 90, {min: 40, max: 130}, wide)).toEqual([130, 70, 100])
  })

  it("caps the neighbour at its max", () => {
    expect(resizePanes([100, 100, 100], 0, -90, wide, {min: 40, max: 130})).toEqual([70, 130, 100])
  })
})
