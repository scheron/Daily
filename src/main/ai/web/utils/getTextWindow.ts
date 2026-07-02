import {clamp} from "@shared/utils/numbers/clamp"

import type {TextWindow, WindowOptions} from "../types"

/**
 * Returns a window of `text`, either from `offset` or starting at the first
 * case-insensitive `find` match at/after `offset`. Pure — used to page large
 * fetched pages without re-fetching.
 *
 * @example getTextWindow(spec, {find: "register", size: 16000})
 */
export function getTextWindow(text: string, opts: WindowOptions): TextWindow {
  const total = text.length
  let start = clamp(opts.offset ?? 0, 0, total)
  let matchIndex: number | null = null

  if (opts.find && opts.find.length > 0) {
    const idx = text.toLowerCase().indexOf(opts.find.toLowerCase(), start)
    if (idx === -1) {
      return {window: "", start, end: start, total, hasMore: false, matchIndex: null, found: false}
    }
    matchIndex = idx
    start = idx
  }

  const end = Math.min(total, start + opts.size)
  return {window: text.slice(start, end), start, end, total, hasMore: end < total, matchIndex, found: true}
}
