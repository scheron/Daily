import {afterEach, beforeEach, vi} from "vitest"

/** Registers `beforeEach`/`afterEach` hooks to stub `navigator.clipboard` and `document.execCommand("copy")` and restore them after each test. */
export function stubClipboard() {
  let originalClipboardDescriptor: PropertyDescriptor | undefined
  let originalExecCommandDescriptor: PropertyDescriptor | undefined
  let copiedText: string | null = null

  beforeEach(() => {
    copiedText = null
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
    originalExecCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand")
    Object.defineProperty(navigator, "clipboard", {value: undefined, configurable: true})
    document.execCommand = vi.fn((command: string) => {
      if (command === "copy") copiedText = document.body.querySelector("textarea")?.value ?? null
      return true
    })
  })

  afterEach(() => {
    if (originalClipboardDescriptor) Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor)
    else Reflect.deleteProperty(navigator, "clipboard")
    if (originalExecCommandDescriptor) Object.defineProperty(document, "execCommand", originalExecCommandDescriptor)
    else Reflect.deleteProperty(document, "execCommand")
    document.body.innerHTML = ""
  })

  return {
    read() {
      return copiedText
    },
    clear() {
      copiedText = null
    },
  }
}
