import {isObject, isString} from "@shared/utils/common/validators"

/**
 * Redact tool params for log output. Keeps the keys so debugging "called
 * with wrong fields" is still possible, but drops the values.
 */
export function redactToolParamsForLog(toolName: string, params: unknown): {toolName: string; paramKeys: string[]} {
  const keys: string[] = []
  if (isObject(params)) {
    keys.push(...Object.keys(params as Record<string, unknown>))
  } else if (isString(params)) {
    try {
      const parsed = JSON.parse(params)
      if (isObject(parsed)) {
        keys.push(...Object.keys(parsed as Record<string, unknown>))
      }
    } catch {
      // params is a non-JSON string — emit no keys.
    }
  }
  return {toolName, paramKeys: keys}
}
