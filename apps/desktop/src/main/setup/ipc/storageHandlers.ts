import {toSettingsView} from "@daily/core"

import type {IStorageController} from "@daily/core"
import type {Task} from "@daily/protocol"
import type {QuickCaptureForwardedChannel} from "@main/quickCaptureHelper/helperProtocol"

export type SharedStorageHandlers = Record<QuickCaptureForwardedChannel, (...args: any[]) => unknown>

/** The storage calls both Daily's own windows and the quick-capture helper make, so a request from the helper runs exactly what the same call from a window runs. */
export function createSharedStorageHandlers(getStorage: () => IStorageController | null): SharedStorageHandlers {
  return {
    "settings:load": async () => {
      const settings = await getStorage()?.loadSettings()
      return settings ? toSettingsView(settings) : undefined
    },
    "tasks:get-all": () => getStorage()?.getAllTasks(),
    "tasks:create": (task: Omit<Task, "id" | "createdAt" | "updatedAt" | "branchId"> & {branchId?: Task["branchId"]; id?: Task["id"]}) =>
      getStorage()?.createTask(task as Task),
    "branches:get-many": () => getStorage()?.getBranchList(),
    "tags:get-many": () => getStorage()?.getTagList(),
  }
}
