/**
 * Utility functions for cursor and selection position checking
 * Used to determine when to show/hide WYSIWYG decorations
 */

/**
 * Check if cursor is inside or touching a range
 */
export function isCursorInRange(cursorPos: number, from: number, to: number): boolean {
  return cursorPos >= from && cursorPos <= to
}

/**
 * Check if selection overlaps with a range
 */
export function isSelectionOverlapping(selectionFrom: number, selectionTo: number, from: number, to: number): boolean {
  return selectionFrom < to && selectionTo > from
}

/**
 * Determine if raw syntax should be shown for an element
 * Show raw when:
 * 1. Not in readonly mode
 * 2. Cursor is inside element OR selection overlaps element
 */
export function shouldShowRaw(
  cursorPos: number,
  selectionFrom: number,
  selectionTo: number,
  elementFrom: number,
  elementTo: number,
  isReadonly: boolean,
): boolean {
  if (isReadonly) return false

  const hasSelection = selectionFrom !== selectionTo
  const cursorInRange = isCursorInRange(cursorPos, elementFrom, elementTo)
  const selectionOverlaps = hasSelection && isSelectionOverlapping(selectionFrom, selectionTo, elementFrom, elementTo)

  return cursorInRange || selectionOverlaps
}
