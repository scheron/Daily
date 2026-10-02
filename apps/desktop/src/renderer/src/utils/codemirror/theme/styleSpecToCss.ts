import type {StyleSpec} from "./types"

/**
 * Renders a flat theme spec as plain stylesheet text, for a host that shows editor-themed markup without an editor.
 * @example
 * styleSpecToCss({".a": {borderRadius: "1px"}}) // ".a{border-radius:1px}"
 */
export function styleSpecToCss(spec: StyleSpec): string {
  return Object.entries(spec)
    .map(([selector, declarations]) => {
      if (typeof declarations !== "object" || declarations === null) return ""

      const body = Object.entries(declarations)
        .map(([property, value]) => `${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
        .join(";")
      return `${selector}{${body}}`
    })
    .join("")
}
