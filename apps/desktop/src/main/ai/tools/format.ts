import {isObject, isString, notUndefined} from "@daily/std"

import type {MessageLLM} from "@main/ai/types"
import type {ToolResult} from "./types"

/**
 * Render a ToolResult as the `content` string of an OpenAI-format `tool`
 * role message. Keeps the model-facing payload deterministic and concise:
 * never dumps structured data unless the tool explicitly produced it, and
 * never carries `get_attachment`'s bytes — those reach the model only
 * through the `image_url` part `toModelImageMessage` builds separately.
 */
export function toModelToolMessage(toolName: string, result: ToolResult): string {
  const safeResult = toPersistableToolResult(toolName, result)
  if (safeResult.error) return JSON.stringify({success: false, error: safeResult.error})

  const summary = safeResult.summary ?? (isString(safeResult.data) ? safeResult.data : "")
  if (summary) return JSON.stringify({success: safeResult.success, data: summary})

  if (notUndefined(safeResult.data)) return JSON.stringify({success: safeResult.success, data: safeResult.data})

  return JSON.stringify({success: safeResult.success})
}

/**
 * `get_attachment`'s own image, as a `user` message the model actually sees it in: OpenAI Chat
 * Completions allows only text inside a `tool` message, so the image rides separately, right after
 * it. Undefined for every other tool's result, and for one this call itself did not carry an image.
 */
export function toModelImageMessage(toolName: string, result: ToolResult): MessageLLM | undefined {
  if (toolName !== "get_attachment" || !result.success || !isImageAttachment(result.data)) return undefined

  const {dataBase64, mimeType, name} = result.data

  return {
    role: "user",
    content: [
      {type: "text", text: `The image from the attachment "${name}":`},
      {type: "image_url", image_url: {url: `data:${mimeType};base64,${dataBase64}`}},
    ],
  }
}

/**
 * The same result, ready to persist: `get_attachment`'s bytes never reach `ai_steps.payload_json`
 * — restoring a past session would otherwise bloat on every image a task ever carried.
 */
export function toPersistableToolResult(toolName: string, result: ToolResult): ToolResult {
  if (toolName !== "get_attachment" || !isImageAttachment(result.data)) return result

  return {...result, data: {...result.data, dataBase64: "[image bytes omitted]"}}
}

/**
 * Render a ToolResult as the renderer-facing {name, result} pair that
 * shows up under "N tools used" in the chat UI. Picks the most useful
 * human-readable line available.
 */
export function toRendererToolCall(toolName: string, result: ToolResult): {name: string; result: string} {
  const summary = result.summary ?? (isString(result.data) ? result.data : "")
  const text = summary || result.error || (result.success ? "Done" : "Failed")
  return {name: toolName, result: text}
}

function isImageAttachment(data: unknown): data is {dataBase64: string; mimeType: string; name: string; [key: string]: unknown} {
  if (!isObject(data)) return false
  const record = data as Record<string, unknown>
  return isString(record.dataBase64) && isString(record.mimeType) && isString(record.name)
}
