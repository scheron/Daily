import type {RegisteredTool} from "../../types"

/**
 * Protocol-level tool: the ONLY channel for user-visible messages from the
 * agent. The `AIController.sendMessage` loop SPECIAL-CASES this tool — it
 * does NOT fire hooks and does NOT route through the executor. Instead the
 * `text` parameter is captured as the turn's final message and the loop
 * breaks. The `execute()` body below is a no-op fallback for safety (it
 * should never be invoked in normal flow).
 */
export const respond: RegisteredTool = {
  name: "respond",
  description:
    "Send a user-visible message. This is the ONLY way to communicate with the user. " +
    "The text you pass here is exactly what the user sees. " +
    "Call this once when you have finished the request (or when you need to ask the user a question). " +
    "Do not include reasoning or tool-call traces.",
  parameters: {
    type: "object",
    properties: {
      text: {type: "string", description: "The exact text shown to the user. Plain prose, no labels."},
    },
    required: ["text"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params) {
    const text = typeof params.text === "string" ? params.text : ""
    return {success: true, data: text}
  },
}
