import {parseAccelerator} from "@shared/utils/shortcuts/parseAccelerator"

/** @example toAcceleratorKeyCaps("Command+Alt+Space") // ["⌘", "⌥", "Space"] */
export function toAcceleratorKeyCaps(accelerator: string): string[] {
  const devicePlatform = window.BridgeIPC["platform:is-mac"]() ? "mac" : "win"
  const symbols: Record<string, string> =
    devicePlatform === "mac"
      ? {Cmd: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Enter: "↵", Escape: "Esc"}
      : {Cmd: "Win", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Escape: "Esc"}

  return parseAccelerator(accelerator)[devicePlatform].map((token) => symbols[token] ?? token)
}
