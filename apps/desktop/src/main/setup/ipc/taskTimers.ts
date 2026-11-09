import {ipcMain} from "electron"

import type {TaskTimersController} from "@main/modules/task-timers/TaskTimersController"
import type {TaskTimerCommand} from "@shared/types/taskTimer"

export function setupTaskTimersIPC(timers: TaskTimersController) {
  ipcMain.handle("task-timers:get", () => timers.getTimers())
  ipcMain.handle("task-timers:dispatch", (_event, command: TaskTimerCommand) => {
    if (typeof command?.taskId !== "string") return false
    return timers.dispatch(command)
  })
}
