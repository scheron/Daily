import {isObject, isString} from "@shared/utils/common/validators"

/**
 * Host-only running label for the tool_started event. Returns undefined for
 * tools that need no label. Intentionally avoids leaking full params into
 * events — only the bare hostname is surfaced.
 *
 * @example toolEventLabel("read_url", '{"url":"https://example.com/x"}') // "example.com"
 */
export function toolEventLabel(toolName: string, rawArgs: unknown): string | undefined {
  if (toolName !== "read_url") return undefined
  const args = parse(rawArgs)
  const url = isString(args.url) ? args.url : ""
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

function parse(raw: unknown): Record<string, unknown> {
  if (isObject(raw)) return raw as Record<string, unknown>
  if (!isString(raw)) return {}
  try {
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
