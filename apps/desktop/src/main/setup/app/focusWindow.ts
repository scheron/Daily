import {createFocusWindow} from "@main/windows/focus.window"

import type {FocusController} from "@main/focus/FocusController"
import type {FocusSession} from "@shared/types/focus"
import type {BrowserWindow} from "electron"

/**
 * Returns the follower of the session's `isDetached`: a detached session gets the focus window, an attached one loses it. A window
 * closed by hand, which the follower did not close, attaches the session.
 */
export function setupFocusWindow(
  getFocus: () => FocusController | null,
  getMainWindow: () => BrowserWindow | null,
  getFocusWindow: () => BrowserWindow | null,
  setFocusWindow: (window: BrowserWindow | null) => void,
) {
  function open() {
    const detachedWindow = createFocusWindow(getMainWindow()?.getBounds())
    setFocusWindow(detachedWindow)

    detachedWindow.on("closed", () => {
      if (getFocusWindow() !== detachedWindow) return

      setFocusWindow(null)
      void getFocus()?.dispatch({type: "attach"})
    })
  }

  return (session: FocusSession) => {
    const detachedWindow = getFocusWindow()

    if (session.isDetached) {
      if (!detachedWindow) open()
    } else if (detachedWindow) {
      setFocusWindow(null)
      detachedWindow.close()
    }
  }
}
