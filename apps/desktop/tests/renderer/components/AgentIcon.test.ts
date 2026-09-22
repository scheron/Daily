// @vitest-environment happy-dom
// @ts-nocheck
import {describe, expect, it} from "vitest"

import {mount} from "@vue/test-utils"
import AgentIcon from "../../../src/renderer/src/ui/common/sync/AgentIcon.vue"

describe("AgentIcon — the mark each client is drawn with (TC-42)", () => {
  function markOf(name) {
    const wrapper = mount(AgentIcon, {props: {name}})
    const use = wrapper.find("use")
    return use.exists() ? use.attributes("href") : null
  }

  it("maps_TC-42_the_known_clients_exact_trimmed_case-insensitive_name_to_their_mark_and_anything_else_to_the_neutral_glyph", () => {
    expect(markOf("Claude Code")).toBe("#claude-code")
    expect(markOf("Claude")).toBe("#claude")
    expect(markOf("ChatGPT")).toBe("#openai")
    expect(markOf("  claude code  ")).toBe("#claude-code")
    expect(markOf("CHATGPT")).toBe("#openai")
    expect(markOf("Cursor")).toBe("#ai")
    expect(markOf("Claude Evil")).toBe("#ai")
    expect(markOf("codex-fork")).toBe("#ai")
    expect(markOf("Codex")).toBe("#codex")
    expect(markOf("  CODEX  ")).toBe("#codex")
  })
})
