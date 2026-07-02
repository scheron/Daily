import {clamp} from "@shared/utils/numbers/clamp"

import {WEB_LIMITS, WEB_READ_BUDGET} from "../constants"

import type {WebReadBudget} from "../types"

/**
 * Scales how much fetched page text may enter the model context to the model's
 * context window. Unknown context (remote APIs) falls back to the standard
 * limits; a small local model gets proportionally less so one page can't swamp
 * its context, a large one gets more.
 *
 * @example computeWebReadBudget(8192) // small local model → smaller window/budget
 */
export function computeWebReadBudget(contextTokens: number | null): WebReadBudget {
  if (!contextTokens || contextTokens <= 0) {
    return {windowChars: WEB_LIMITS.maxTextChars, maxServedChars: WEB_LIMITS.maxServedCharsPerPage}
  }
  const ctxChars = contextTokens * WEB_READ_BUDGET.charsPerToken
  const maxServedChars = clamp(Math.round(ctxChars * WEB_READ_BUDGET.servedFraction), WEB_READ_BUDGET.minServed, WEB_READ_BUDGET.maxServed)
  const windowChars = clamp(
    Math.round(ctxChars * WEB_READ_BUDGET.windowFraction),
    WEB_READ_BUDGET.minWindow,
    Math.min(WEB_READ_BUDGET.maxWindow, maxServedChars),
  )
  return {windowChars, maxServedChars}
}
