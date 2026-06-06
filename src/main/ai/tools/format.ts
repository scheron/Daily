import type {ToolResult} from "./types"

/**
 * Render a ToolResult as the `content` string of an OpenAI-format `tool`
 * role message. Keeps the model-facing payload deterministic and concise:
 * never dumps structured data unless the tool explicitly produced it.
 */
export function toModelToolMessage(result: ToolResult): string {
  if (result.error) return JSON.stringify({success: false, error: result.error})

  const summary = result.summary ?? (typeof result.data === "string" ? result.data : "")
  if (summary) return JSON.stringify({success: result.success, data: summary})

  if (result.data !== undefined) return JSON.stringify({success: result.success, data: result.data})

  return JSON.stringify({success: result.success})
}

/**
 * Render a ToolResult as the renderer-facing {name, result} pair that
 * shows up under "N tools used" in the chat UI. Picks the most useful
 * human-readable line available.
 */
export function toRendererToolCall(toolName: string, result: ToolResult): {name: string; result: string} {
  const summary = result.summary ?? (typeof result.data === "string" ? result.data : "")
  const text = summary || result.error || (result.success ? "Done" : "Failed")
  return {name: toolName, result: text}
}
