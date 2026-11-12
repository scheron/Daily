export function canonicalWorkflowValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalWorkflowValue).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalWorkflowValue(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
