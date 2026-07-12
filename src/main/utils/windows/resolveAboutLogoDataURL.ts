import {join} from "path"
import {app, nativeImage} from "electron"

import {electronPaths} from "@/runtime/electronPaths"

/**
 * Resolves the app icon to a data URL for embedding in the About window's
 * inline HTML. Tries the packaged icon, then `public/icon.png` from the app
 * path and the cwd.
 * @returns A `data:` URL for the first icon found, or `null` if none resolve.
 */
export function resolveAboutLogoURL(): string | null {
  const candidates = [electronPaths.icon(), join(app.getAppPath(), "public", "icon.png"), join(process.cwd(), "public", "icon.png")]

  for (const iconPath of candidates) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) return image.toDataURL()
  }

  return null
}
