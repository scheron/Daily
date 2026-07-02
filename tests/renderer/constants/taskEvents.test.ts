// @ts-nocheck
import {describe, expect, it} from "vitest"

import {TASK_EVENT_META} from "@/constants/taskEvents"

const TYPES = ["created", "completed", "discarded", "reactivated", "edited", "deleted", "restored", "moved"]

describe("TASK_EVENT_META", () => {
  it("covers every task event type with an icon and a verb", () => {
    for (const type of TYPES) {
      expect(TASK_EVENT_META[type]).toBeDefined()
      expect(TASK_EVENT_META[type].icon).toBeTruthy()
      expect(TASK_EVENT_META[type].verb).toBeTruthy()
    }
  })
})
