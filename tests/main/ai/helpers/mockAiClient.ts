// @ts-nocheck
import {vi} from "vitest"

/**
 * One scripted response. Either a parsed assistant message or a thrown
 * error. The shape matches what `OpenAiCompatibleClient.chat` would return
 * after parsing.
 */
export type ScriptedResponse =
  | {
      message: {
        role: "assistant"
        content: string | null
        tool_calls?: Array<{id: string; type: "function"; function: {name: string; arguments: Record<string, unknown>}}>
      }
      done?: boolean
    }
  | {throws: Error}
  | {hang: true}

/**
 * Wires the active provider's `chat` method to walk through the given
 * scripted responses. Tracks the call count and exposes it via the
 * returned `spy`.
 */
export function scriptedChat(ctrl: any, responses: ScriptedResponse[]) {
  let i = 0
  const provider = ctrl.openaiClient
  const spy = vi.spyOn(provider, "chat").mockImplementation(async () => {
    const r = responses[i++]
    if (!r) throw new Error(`Script exhausted at step ${i}`)
    if ("throws" in r) throw r.throws
    if ("hang" in r) return new Promise(() => {})
    return {message: r.message, done: r.done ?? true}
  })
  return {
    spy,
    get callCount() {
      return i
    },
  }
}

/** Convenience: helpers for building scripted responses. */
export const respond = (text: string) => ({
  message: {
    role: "assistant" as const,
    content: null,
    tool_calls: [{id: `c_${text.slice(0, 5)}`, type: "function" as const, function: {name: "respond", arguments: {text}}}],
  },
})

export const callTool = (id: string, name: string, args: Record<string, unknown>) => ({
  message: {
    role: "assistant" as const,
    content: null,
    tool_calls: [{id, type: "function" as const, function: {name, arguments: args}}],
  },
})
