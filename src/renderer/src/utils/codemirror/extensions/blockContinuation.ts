import {keymap} from "@codemirror/view"

import type {EditorState, Extension} from "@codemirror/state"
import type {KeyBinding} from "@codemirror/view"

const BLOCK_PATTERNS = {
  // Blockquote: > or > with spaces
  blockquote: /^(\s*)(>\s*)/,
  // Unordered list: -, *, +
  bulletList: /^(\s*)([-*+]\s+)/,
  // Ordered list: 1., 2., etc.
  orderedList: /^(\s*)(\d+\.\s+)/,
  // Checkbox (unchecked): - [ ]
  checkboxUnchecked: /^(\s*)([-*+]\s+\[\s\]\s+)/,
  // Checkbox (checked): - [x] or - [X]
  checkboxChecked: /^(\s*)([-*+]\s+\[[xX]\]\s+)/,
}

/**
 * format Enter key to continue block prefixes
 */
function formatEnterKey(state: EditorState): {from: number; to: number; insert: string} | null {
  const line = state.doc.lineAt(state.selection.main.from)
  const lineText = line.text

  // Check for checkbox (checked or unchecked) - prioritize this over regular lists
  const checkboxMatch = lineText.match(BLOCK_PATTERNS.checkboxUnchecked) || lineText.match(BLOCK_PATTERNS.checkboxChecked)
  if (checkboxMatch) {
    const indent = checkboxMatch[1]
    const prefix = checkboxMatch[2]

    // If line only contains the checkbox prefix (no content), exit the list
    if (lineText.trim() === prefix.trim()) {
      return {
        from: line.from,
        to: line.to,
        insert: "",
      }
    }

    // Continue with unchecked checkbox (always start new items unchecked)
    const newPrefix = prefix.replace(/\[[xX]\]/, "[ ]")
    return {
      from: state.selection.main.from,
      to: state.selection.main.from,
      insert: `\n${indent}${newPrefix}`,
    }
  }

  // Check for blockquote
  const quoteMatch = lineText.match(BLOCK_PATTERNS.blockquote)
  if (quoteMatch) {
    const indent = quoteMatch[1]
    const prefix = quoteMatch[2]

    // If line only contains the quote marker (no content), exit the quote
    if (lineText.trim() === prefix.trim()) {
      return {
        from: line.from,
        to: line.to,
        insert: "",
      }
    }

    // Continue blockquote
    return {
      from: state.selection.main.from,
      to: state.selection.main.from,
      insert: `\n${indent}${prefix}`,
    }
  }

  // Check for ordered list
  const orderedMatch = lineText.match(BLOCK_PATTERNS.orderedList)
  if (orderedMatch) {
    const indent = orderedMatch[1]
    const prefix = orderedMatch[2]

    // If line only contains the list marker (no content), exit the list
    if (lineText.trim() === prefix.trim()) {
      return {
        from: line.from,
        to: line.to,
        insert: "",
      }
    }

    // Increment the number for next item
    const currentNum = parseInt(prefix)
    const newPrefix = `${currentNum + 1}. `
    return {
      from: state.selection.main.from,
      to: state.selection.main.from,
      insert: `\n${indent}${newPrefix}`,
    }
  }

  // Check for bullet list
  const bulletMatch = lineText.match(BLOCK_PATTERNS.bulletList)
  if (bulletMatch) {
    const indent = bulletMatch[1]
    const prefix = bulletMatch[2]

    // If line only contains the list marker (no content), exit the list
    if (lineText.trim() === prefix.trim()) {
      return {
        from: line.from,
        to: line.to,
        insert: "",
      }
    }

    // Continue bullet list
    return {
      from: state.selection.main.from,
      to: state.selection.main.from,
      insert: `\n${indent}${prefix}`,
    }
  }

  // No block prefix found, return null to use default behavior
  return null
}

/**
 * Keymap for Enter key to continue block prefixes
 */
const blockContinuationKeymap: KeyBinding[] = [
  {
    key: "Enter",
    run: (view) => {
      const change = formatEnterKey(view.state)

      if (change) {
        view.dispatch({
          changes: change,
          selection: {anchor: change.from + change.insert.length},
        })
        return true
      }

      // Return false to use default Enter behavior
      return false
    },
  },
]

/**
 * Block continuation extension
 * Automatically continues block prefixes (blockquotes, lists, checkboxes) when pressing Enter
 */
export function createBlockContinuationExtension(): Extension {
  return keymap.of(blockContinuationKeymap)
}
