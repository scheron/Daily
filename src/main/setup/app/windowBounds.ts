import {APP_CONFIG} from "@/config"

import type {MainWindowSettings} from "@shared/types/storage"

export type RestoredMainWindowOptions = {
  width: number
  height: number
}

export function resolveMainWindowOptions(savedState?: MainWindowSettings): RestoredMainWindowOptions {
  const minWidth = APP_CONFIG.window.main.minWidth
  const minHeight = APP_CONFIG.window.main.minHeight
  const defaultWidth = APP_CONFIG.window.main.width
  const defaultHeight = APP_CONFIG.window.main.height

  const width = typeof savedState?.width === "number" && savedState.width > 0 ? Math.max(savedState.width, minWidth) : defaultWidth
  const height = typeof savedState?.height === "number" && savedState.height > 0 ? Math.max(savedState.height, minHeight) : defaultHeight

  return {width, height}
}
