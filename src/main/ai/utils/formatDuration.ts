import {toDurationLabel} from "@shared/utils/date/formatters"

/**
 * Render a duration in seconds as a human-readable label for the LLM.
 * Returns "none" for zero/negative values so the model can read the absence
 * of time as a value rather than as a missing field.
 */
export function formatDuration(seconds: number): string {
  return seconds > 0 ? toDurationLabel(seconds) : "none"
}
