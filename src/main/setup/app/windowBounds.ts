import {screen} from "electron"

import {APP_CONFIG} from "@/config"

import type {MainWindowSettings} from "@shared/types/storage"

export type RestoredMainWindowOptions = {
  width: number
  height: number
  x?: number
  y?: number
  center: boolean
}

export function resolveMainWindowOptions(savedState?: MainWindowSettings): RestoredMainWindowOptions {
  const minWidth = APP_CONFIG.window.main.minWidth
  const minHeight = APP_CONFIG.window.main.minHeight
  const defaultWidth = APP_CONFIG.window.main.width
  const defaultHeight = APP_CONFIG.window.main.height

  const width = typeof savedState?.width === "number" && savedState.width > 0 ? Math.max(savedState.width, minWidth) : defaultWidth
  const height = typeof savedState?.height === "number" && savedState.height > 0 ? Math.max(savedState.height, minHeight) : defaultHeight

  const x = savedState?.x
  const y = savedState?.y
  const hasPosition = typeof x === "number" && typeof y === "number"
  if (!hasPosition) {
    return {width, height, center: true}
  }

  const bounds = {x, y, width, height}
  if (!isBoundsVisible(bounds)) {
    return {width, height, center: true}
  }

  return {width, height, x, y, center: false}
}

function isBoundsVisible(bounds: {x: number; y: number; width: number; height: number}): boolean {
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea

  return (
    bounds.x < workArea.x + workArea.width &&
    bounds.x + bounds.width > workArea.x &&
    bounds.y < workArea.y + workArea.height &&
    bounds.y + bounds.height > workArea.y
  )
}
