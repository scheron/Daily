import type {IconName} from "@/ui/base/BaseIcon"

/**
 * @example
 * toAgentIconName("Claude Code") // -> "claude-code"
 * toAgentIconName("  codex  ")   // -> "openai"
 * toAgentIconName("Cursor")      // -> "ai"
 */
export function toAgentIconName(agentName: string): IconName {
  switch (agentName.trim().toLowerCase()) {
    case "claude code":
    case "claude":
      return "claude-code"
    case "codex":
      return "openai"
    default:
      return "ai"
  }
}
