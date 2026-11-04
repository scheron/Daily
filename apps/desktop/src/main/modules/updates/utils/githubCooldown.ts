import type {GitHubReleaseResponse} from "../release"
import type {UpdateCheckSchedule} from "./updateCheckSchedule"

export function githubCooldown(
  response: GitHubReleaseResponse,
  now: number,
  fallbackFailures: number,
): Pick<UpdateCheckSchedule, "restNotBefore" | "fallbackFailures"> | null {
  const remaining = response.headers.get("x-ratelimit-remaining")
  const retryAfter = response.headers.get("retry-after")
  const primaryLimit = remaining === "0"
  const throttled =
    response.status === 429 || (response.status === 403 && (primaryLimit || retryAfter !== null || /rate limit/i.test(response.message ?? "")))
  if (!throttled && !response.ok) return null

  if (response.ok && !primaryLimit) return {restNotBefore: 0, fallbackFailures: 0}

  const resetAt = primaryLimit ? epochSecondsToMilliseconds(response.headers.get("x-ratelimit-reset")) : 0
  const deadline = Math.max(resetAt, retryAfterDeadline(retryAfter, now))
  if (deadline > now) return {restNotBefore: deadline, fallbackFailures: 0}

  const MINUTE = 60_000
  const MAX_FALLBACK_MINUTES = 60
  const MAX_FALLBACK_FAILURES = 1 + Math.ceil(Math.log2(MAX_FALLBACK_MINUTES))
  const failures = response.ok ? 0 : Math.min(fallbackFailures + 1, MAX_FALLBACK_FAILURES)
  const delay = Math.min(MAX_FALLBACK_MINUTES, 2 ** Math.max(0, failures - 1)) * MINUTE
  return {restNotBefore: now + delay, fallbackFailures: failures}
}

function epochSecondsToMilliseconds(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0
  const milliseconds = Number(value) * 1000
  return Number.isSafeInteger(milliseconds) ? milliseconds : 0
}

function retryAfterDeadline(value: string | null, now: number): number {
  if (!value) return 0
  if (/^\d+$/.test(value)) {
    const deadline = now + epochSecondsToMilliseconds(value)
    return Number.isSafeInteger(deadline) ? deadline : 0
  }
  const date = Date.parse(value)
  return Number.isFinite(date) ? date : 0
}
