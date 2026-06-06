import type {Tool, ToolCallLLM} from "@/ai/types"

/**
 * Convert OpenAI-style function-call tool definitions into a plain-text section
 * for inclusion in the system prompt. Used by small local models that struggle
 * with native function-call grammar constraints — they describe tools in text
 * and parse tool calls back from the assistant's content.
 */
export function toolsToCompatPrompt(tools: Tool[]): string {
  if (!tools.length) return ""

  const lines: string[] = []
  lines.push("AVAILABLE TOOLS:")

  for (const tool of tools) {
    const fn = tool.function
    lines.push("")
    lines.push(`- ${fn.name}: ${fn.description}`)
    const properties = fn.parameters?.properties ?? {}
    const required = new Set(fn.parameters?.required ?? [])
    const propNames = Object.keys(properties)
    if (propNames.length > 0) {
      lines.push("  Parameters:")
      for (const name of propNames) {
        const p = properties[name]
        const req = required.has(name) ? " (required)" : ""
        const desc = p.description ? ` — ${p.description}` : ""
        const enumStr = p.enum ? ` [one of: ${p.enum.join(", ")}]` : ""
        lines.push(`  - ${name}: ${p.type}${req}${desc}${enumStr}`)
      }
    }
  }

  lines.push("")
  lines.push("TOOL CALL FORMAT — emit each call as either:")
  lines.push("")
  lines.push("```tool_call")
  lines.push(`{"name": "tool_name", "arguments": {"param1": "value1"}}`)
  lines.push("```")
  lines.push("")
  lines.push("OR using XML tags:")
  lines.push("")
  lines.push("<tool_call>")
  lines.push(`{"name": "tool_name", "arguments": {"param1": "value1"}}`)
  lines.push("</tool_call>")
  lines.push("")
  lines.push("Rules:")
  lines.push("- Each tool_call contains a single JSON object with `name` and `arguments`.")
  lines.push("- For multiple tool calls in one turn, emit multiple tool_call blocks in sequence.")
  lines.push("- To send a user-visible reply, call the `respond` tool with your final text.")

  return lines.join("\n")
}

let _compatIdCounter = 0

type RawCall = {full: string; name: string; argsBody: string}

const FENCED_RE = /```tool_call\s*\n([\s\S]*?)\n```/g
const XML_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
const XML_FUNCTION_RE = /<function=([\w.-]+)>\s*([\s\S]*?)\s*<\/function>/
const XML_NAMED_TAG_RE = /<([\w.-]+)>\s*([\s\S]*?)\s*<\/\1>/

/**
 * Map of common name mistakes some local models make when emitting tool calls.
 * Keyed by the wrong name produced by the model, value is the canonical tool name.
 */
const NAME_ALIASES: Record<string, string> = {
  response: "respond",
  reply: "respond",
  answer: "respond",
}

function normalizeName(raw: string): string {
  return NAME_ALIASES[raw] ?? raw
}

/** Tolerant JSON parser: handles single-quote and unquoted-key variants emitted by some local models. */
function tryParseLoose(body: string): unknown {
  const trimmed = body.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    // Continue with cleanup attempts
  }
  // Replace single-quoted strings with double-quoted
  const singleToDouble = trimmed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner: string) => `"${inner.replace(/"/g, '\\"')}"`)
  try {
    return JSON.parse(singleToDouble)
  } catch {
    // Continue
  }
  // Quote unquoted object keys: { foo: ... } -> { "foo": ... }
  const quotedKeys = singleToDouble.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
  try {
    return JSON.parse(quotedKeys)
  } catch {
    return undefined
  }
}

function collectFenced(content: string, calls: RawCall[]): void {
  for (const m of content.matchAll(FENCED_RE)) {
    const body = (m[1] ?? "").trim()
    const parsed = tryParseLoose(body) as Record<string, unknown> | undefined
    if (parsed && typeof parsed.name === "string") {
      calls.push({full: m[0], name: normalizeName(parsed.name), argsBody: JSON.stringify(parsed.arguments ?? {})})
    }
  }
}

function collectXml(content: string, calls: RawCall[]): void {
  for (const m of content.matchAll(XML_RE)) {
    const inner = (m[1] ?? "").trim()
    if (!inner) continue

    // Format A: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    const parsed = tryParseLoose(inner) as Record<string, unknown> | undefined
    if (parsed && typeof parsed.name === "string") {
      calls.push({full: m[0], name: normalizeName(parsed.name), argsBody: JSON.stringify(parsed.arguments ?? {})})
      continue
    }

    // Format B: <tool_call><function=NAME>{...}</function></tool_call>
    const fnMatch = inner.match(XML_FUNCTION_RE)
    if (fnMatch) {
      const name = fnMatch[1]
      const body = (fnMatch[2] ?? "").trim()
      calls.push({full: m[0], name: normalizeName(name), argsBody: body})
      continue
    }

    // Format C: <tool_call><NAME>{...}</NAME></tool_call>  (Qwen3.5 fine-tune)
    const tagMatch = inner.match(XML_NAMED_TAG_RE)
    if (tagMatch) {
      const name = tagMatch[1]
      const body = (tagMatch[2] ?? "").trim()
      calls.push({full: m[0], name: normalizeName(name), argsBody: body})
    }
  }
}

/**
 * Extract tool calls from a model's content. Supports three syntaxes:
 *   1. fenced code block:   ```tool_call\n{"name":..., "arguments":...}\n```
 *   2. XML wrapper:         <tool_call>{"name":..., "arguments":...}</tool_call>
 *   3. XML + function tag:  <tool_call><function=NAME>{...}</function></tool_call>
 * Returns the parsed tool calls and the remaining content with tool_call regions removed.
 */
export function parseCompatToolCalls(content: string | null): {
  toolCalls: ToolCallLLM[]
  remainingContent: string
} {
  if (!content) return {toolCalls: [], remainingContent: ""}

  const raw: RawCall[] = []
  collectFenced(content, raw)
  collectXml(content, raw)

  const toolCalls: ToolCallLLM[] = []
  for (const call of raw) {
    let args: Record<string, unknown> = {}
    const parsed = tryParseLoose(call.argsBody)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>
    }
    _compatIdCounter += 1
    toolCalls.push({
      id: `compat_${_compatIdCounter}`,
      type: "function",
      function: {name: call.name, arguments: args},
    })
  }

  let remainingContent = content
  for (const {full} of raw) {
    remainingContent = remainingContent.replace(full, "")
  }
  remainingContent = remainingContent.trim()

  return {toolCalls, remainingContent}
}
