import {spawn} from "node:child_process"
import {app} from "electron"

import {QUICK_CAPTURE_HELPER_FLAG} from "./helperProtocol"

/** Starts a second process of this same binary in helper mode. Unpackaged, Electron also needs the app path, and the renderer URL electron-vite set is inherited through the environment. */
export function spawnHelper() {
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE

  const args = app.isPackaged ? [QUICK_CAPTURE_HELPER_FLAG] : [app.getAppPath(), QUICK_CAPTURE_HELPER_FLAG]
  return spawn(process.execPath, args, {stdio: ["pipe", "pipe", "pipe"], env})
}
