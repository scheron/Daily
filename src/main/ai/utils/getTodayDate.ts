/**
 * Returns today's date in YYYY-MM-DD form, used as a baseline by tool
 * prompts and as the default `scheduled.date` for new tasks created by the AI.
 */
export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]
}
