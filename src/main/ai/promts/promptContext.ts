export interface PromptDateContext {
  timeZone: string
  today: string
  tomorrow: string
  nextWeek: string
  currentTime: string
  dayOfWeek: string
}

function addDays(base: Date, days: number): Date {
  const result = new Date(base)
  result.setDate(result.getDate() + days)
  return result
}

function formatDateYMD(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((part) => part.type === "year")?.value ?? "1970"
  const month = parts.find((part) => part.type === "month")?.value ?? "01"
  const day = parts.find((part) => part.type === "day")?.value ?? "01"

  return `${year}-${month}-${day}`
}

export function getPromptDateContext(): PromptDateContext {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

  return {
    timeZone,
    today: formatDateYMD(now, timeZone),
    tomorrow: formatDateYMD(addDays(now, 1), timeZone),
    nextWeek: formatDateYMD(addDays(now, 7), timeZone),
    currentTime: now.toLocaleTimeString("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    dayOfWeek: now.toLocaleDateString("en-US", {timeZone, weekday: "long"}),
  }
}
