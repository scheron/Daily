import {spawn} from "node:child_process"
import {app} from "electron"

import {QUICK_TASK_PROCESS_FLAG} from "@shared/constants/quickTask"

/** Starts a second process of this same binary as the Quick task process. Unpackaged, Electron also needs the app path, and the renderer URL electron-vite set is inherited through the environment. */
export function spawnQuickTaskProcess() {
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE

  const args = app.isPackaged ? [QUICK_TASK_PROCESS_FLAG] : [app.getAppPath(), QUICK_TASK_PROCESS_FLAG]
  return spawn(process.execPath, args, {stdio: ["pipe", "pipe", "pipe"], env})
}
