import {WINDOWS_CONFIG} from "@shared/config/windows"
import {isPositive} from "@shared/utils/common/validators"

import type {MainWindowSettings} from "@shared/types/storage"

export type RestoredMainWindowOptions = {
  width: number
  height: number
}

export function resolveMainWindowOptions(savedState?: MainWindowSettings): RestoredMainWindowOptions {
  const minWidth = WINDOWS_CONFIG.main.minWidth
  const minHeight = WINDOWS_CONFIG.main.minHeight
  const defaultWidth = WINDOWS_CONFIG.main.width
  const defaultHeight = WINDOWS_CONFIG.main.height

  const width = isPositive(savedState?.width) ? Math.max(savedState.width, minWidth) : defaultWidth
  const height = isPositive(savedState?.height) ? Math.max(savedState.height, minHeight) : defaultHeight

  return {width, height}
}
