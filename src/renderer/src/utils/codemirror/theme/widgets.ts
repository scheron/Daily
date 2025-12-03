import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Custom widget styles
 * - Task checkboxes
 * - Task marker containers
 */
export const widgetStyles: Record<string, StyleSpec> = {
  // Task list checkboxes
  ".cm-task-marker": {
    display: "inline-flex",
    alignItems: "center",
    marginRight: "0.5rem",
    marginLeft: "0.5rem",
    verticalAlign: "middle",
    lineHeight: "1.8",
  },

  // Checkbox base styles (matches markdown.css)
  ".cm-task-checkbox": {
    appearance: "none",
    width: "1.2em",
    height: "1.2em",
    border: "2px solid var(--color-base-content)",
    borderRadius: "4px",
    verticalAlign: "middle",
    position: "relative",
    margin: "0",
    backgroundColor: "transparent",
  },

  // Checked checkbox styles
  ".cm-task-checkbox-checked": {
    backgroundColor: "var(--color-accent)",
    borderColor: "var(--color-accent)",
  },

  // Checkmark inside checked checkbox (using ::after pseudo-element)
  ".cm-task-checkbox-checked::after": {
    content: "''",
    display: "block",
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%) rotate(45deg)",
    width: "0.3em",
    height: "0.6em",
    border: "solid var(--color-base-100)",
    borderWidth: "0 2px 2px 0",
  },

  // Lines containing task markers should have consistent height
  ".cm-line:has(.cm-task-marker)": {
    minHeight: "1.8em",
    display: "flex",
    alignItems: "center",
  },
}
