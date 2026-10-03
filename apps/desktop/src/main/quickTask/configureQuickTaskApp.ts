import {join} from "node:path"
import {app} from "electron"

import {ENV} from "@daily/core"
import {APP_CONFIG} from "@daily/protocol"

/** Sets this process up as the Quick task process before Electron is ready: no Dock icon or menu bar, and a userData directory of its own that Daily's storage never shares. */
export function configureQuickTaskApp() {
  if (process.platform === "darwin") app.setActivationPolicy("accessory")

  app.setName(`${APP_CONFIG.name} Quick Task`)
  app.setPath("userData", join(app.getPath("appData"), `${APP_CONFIG.name}-QuickTask${ENV.isDevelopment ? "-dev" : ""}`))
}
