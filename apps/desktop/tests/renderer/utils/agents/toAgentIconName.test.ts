import {describe, expect, it} from "vitest"

import {toAgentIconName} from "@/utils/agents/toAgentIconName"

describe("toAgentIconName", () => {
  it("maps_TC-42_the_known_clients_exact_trimmed_case-insensitive_name_to_their_mark_and_anything_else_to_the_neutral_glyph", () => {
    expect(toAgentIconName("Claude Code")).toBe("claude-code")
    expect(toAgentIconName("Claude")).toBe("claude-code")
    expect(toAgentIconName("Codex")).toBe("openai")
    expect(toAgentIconName("  claude code  ")).toBe("claude-code")
    expect(toAgentIconName("CODEX")).toBe("openai")
    expect(toAgentIconName("Cursor")).toBe("ai")
    expect(toAgentIconName("Claude Evil")).toBe("ai")
    expect(toAgentIconName("codex-fork")).toBe("ai")
  })
})
