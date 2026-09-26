// @ts-nocheck
import {describe, expect, it} from "vitest"

import {toTaskTitle} from "../../../../src/shared/utils/tasks/toTaskTitle"

describe("toTaskTitle", () => {
  it("reduces_TC-17_the_first_non-empty_line_of_a_tasks_markdown_content_to_plain_text", () => {
    expect(toTaskTitle("# Ship **promo** codes\nmore")).toBe("Ship promo codes")
    expect(toTaskTitle("\n\n- [ ] Write [release notes](https://x.y)")).toBe("Write release notes")
    expect(toTaskTitle("> quoted `code` ~~old~~ line")).toBe("quoted code old line")
    expect(toTaskTitle("1. first_step_name")).toBe("first_step_name")
    expect(toTaskTitle("")).toBe("")
  })
})
