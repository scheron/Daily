import type {McpToolResult} from "@/types"

export function textResult(text: string): McpToolResult {
  return {content: [{type: "text", text}]}
}

export function errorResult(message: string): McpToolResult {
  return {content: [{type: "text", text: message}], isError: true}
}

export function dailyNotRunningError(): McpToolResult {
  return errorResult("⚠️ Daily app is not running. Please start Daily to access your tasks.")
}
