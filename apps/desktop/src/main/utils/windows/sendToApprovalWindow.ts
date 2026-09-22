import {focusWindow} from "@main/utils/windows/focusWindow"

import type {WindowsGetter} from "@main/utils/windows/broadcastToWindows"
import type {BrowserWindow} from "electron"

const APPROVAL_WINDOW_PRIORITY = ["main", "settings"] as const

/**
 * Sends a channel to exactly one window, so a request that waits for a person is never asked twice.
 * The focused window wins when it is one of the windows that show approval cards; otherwise the
 * first one still open in `APPROVAL_WINDOW_PRIORITY` takes it, which is why that order is written
 * as the fallback order. The code inside such a card expires, so the target is raised rather than
 * left hidden.
 */
export function sendToApprovalWindow(getWindows: WindowsGetter, channel: string, ...args: unknown[]) {
  const windows = getWindows()
  const candidates = APPROVAL_WINDOW_PRIORITY.map((key) => windows[key]).filter(isOpen)
  const target = candidates.find((win) => win.isFocused()) ?? candidates.at(0)

  if (!target) return

  if (!target.isVisible()) target.show()
  focusWindow(target)
  target.webContents.send(channel, ...args)
}

function isOpen(win: BrowserWindow | null | undefined): win is BrowserWindow {
  return Boolean(win && !win.isDestroyed())
}
