const KEY_CODE_MAP: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  Escape: "Escape",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  IntlBackslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
  NumpadDecimal: ".",
}

/**
 * Map a `KeyboardEvent.code` to its Electron accelerator key name.
 * Returns `null` for modifier-only codes (Shift/Control/Alt/Meta) and unknown keys.
 */
function codeToKey(code: string): string | null {
  if (/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code)) return null
  if (KEY_CODE_MAP[code]) return KEY_CODE_MAP[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return code.slice(6)
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code
  if (code === "CapsLock") return "Capslock"
  if (code === "NumLock") return "Numlock"
  if (code === "ScrollLock") return "Scrolllock"
  return null
}

/**
 * Convert a KeyboardEvent into an Electron-format accelerator string
 * (e.g. `"Command+Alt+Space"`). Returns an empty string when the event
 * does not represent a complete shortcut (e.g. only a modifier key was pressed).
 */
export function formatEventToAccelerator(event: KeyboardEvent): string {
  const key = codeToKey(event.code)
  if (!key) return ""

  const tokens: string[] = []
  if (event.metaKey) tokens.push("Command")
  if (event.ctrlKey) tokens.push("Control")
  if (event.altKey) tokens.push("Alt")
  if (event.shiftKey) tokens.push("Shift")
  tokens.push(key)
  return tokens.join("+")
}
